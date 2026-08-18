# ADR 003: Diagnóstico Cognitivo con IA vía MCP

**Estado:** Aprobado
**Fecha:** 2026-07-10 | **Actualizado:** 2026-08-18
**Contexto:** Integración de un LLM como "cerebro" del diagnóstico

---

## Contexto

El proyecto necesita un motor de diagnóstico que vaya más allá de reglas deterministas. Mientras que `ProcessVehicleDiagnosis` puede detectar umbrales (ej. "temperatura > 110 °C = sobrecalentamiento"), un mecánico real cruza múltiples síntomas, conoce patrones de fallo por modelo de vehículo, y razona sobre causas raíz.

Para el TFM necesitamos:

- Un LLM que reciba datos del vehículo (valores de sensores, DTCs) y genere un diagnóstico narrativo
- Que el LLM pueda ejecutar acciones (resetear simulador, cambiar escenario, pedir más datos)
- Que la interacción con el LLM sea estándar, demostrable y cambiable sin tocar lógica core

## Decisión

Se adopta el **Model Context Protocol (MCP) de Anthropic** como el adaptador de IA, con el siguiente diseño:

### Arquitectura MCP

```
LLM (Claude)  ←→  MCP Server (mcpServer.ts)  ←→  Use Cases + Simulador
```

El MCP Server expone **16 tools** repartidas en tres familias. Se registran en
`infrastructure/mcp/` — `diagnosticTools.ts` (7), `knowledgeTools.ts` (8) y `webSearchTool.ts` (1) —
todas con la misma firma `register(nombre, descripción, schema Zod, handler)`.

**Diagnóstico OBD (7)** — hablan con el vehículo a través de `ObdRepository`:

| Tool | Descripción | Puerto |
|---|---|---|
| `read_pid` | Lee un PID OBD-II. Solo servicios de lectura (01, 02, 03, 05, 06, 07, 09, 0A, 22); los de control se rechazan | `ObdRepository.readPid` |
| `get_dtc_codes` | Códigos de error almacenados (Service 03) | `ObdRepository.readDtcCodes` |
| `get_freeze_frame` | Datos congelados del momento del fallo (Service 02) | `ObdRepository.getFreezeFrame` |
| `read_vin` | VIN del vehículo (Service 09 PID 02) | `ObdRepository.readVin` |
| `get_vehicle_info` | Marca, modelo, año, tipo de motor | `ObdRepository.getVehicleInfo` |
| `get_available_pids` | PIDs soportados por el vehículo conectado (bitmask de Mode 01 PID 00 + catálogo) | `ObdRepository.getSupportedPids` |
| `get_ecu_info` | ECUs descubiertas: nombres, direcciones CAN y protocolo | `ObdRepository.getEcuInfo` |

**Conocimiento / RAG (8)** — leen y escriben los catálogos auto-expansivos y el índice vectorial
(ver ADR 007). Son simétricas: cuatro de búsqueda semántica y cuatro de indexación.

| Tool | Descripción |
|---|---|
| `search_similar_pids` | Búsqueda semántica en el catálogo de PIDs. Devuelve distancia + campos |
| `search_similar_dtcs` | Búsqueda semántica en el catálogo de DTCs |
| `search_similar_diagnoses` | Búsqueda semántica en diagnósticos anteriores |
| `search_similar_ecus` | Búsqueda semántica en el catálogo de ECUs |
| `index_pid` | Indexa un PID descubierto; opcionalmente lo valida contra el vehículo conectado |
| `index_dtc` | Indexa un DTC descubierto; opcionalmente lo valida contra el vehículo conectado |
| `index_diagnosis` | Indexa un diagnóstico resuelto para recuperarlo en el futuro |
| `index_ecu` | Indexa una ECU aprendida en el catálogo relacional y en el índice vectorial |

**Búsqueda web (1)**:

| Tool | Descripción |
|---|---|
| `web_search` | Busca en internet PIDs, DTCs o información que no está en la base vectorial. Sujeta a presupuesto (`webSearchBudget.ts`) |

El bucle de indexación es lo que convierte el sistema en auto-expansivo: lo que el LLM descubre por
`web_search` o le aporta el mecánico entra por una tool `index_*` y queda disponible para el
siguiente diagnóstico sin volver a salir a la red.

### Buenas prácticas MCP aplicadas

Durante la revisión de infraestructura (2026-08-05) se auditaron las [best practices oficiales de MCP](https://modelcontextprotocol.info/docs/best-practices/) y se aplicaron dos patrones clave:

**1. Tool execution errors con `isError: true`**

Cada handler de tool está envuelto en `withErrorHandling()`, que captura excepciones y las devuelve como errores de ejecución MCP:

```ts
{ content: [{ type: 'text', text: err.message }], isError: true }
```

Esto permite que el LLM reciba el mensaje de error real y pueda auto-corregirse (ej. reintentar con otro PID), en lugar de recibir un error de protocolo JSON-RPC genérico. El spec de MCP recomienda este patrón para que los modelos puedan recuperarse de fallos.

Los errores se categorizan según las best practices de MCP para que el LLM pueda decidir la acción correcta:

| Error | Categoría | Significado para el LLM |
|---|---|---|
| `Elm327NoDataError` | `client_error` | PID/DTC no soportado por la ECU → probar otro PID |
| `Elm327ConnectionError` | `external_error` | Dispositivo ELM327 no disponible → reintentar más tarde |
| `Elm327ParseError` | `server_error` | Respuesta corrupta → notificar al usuario |
| Cualquier otro | `server_error` | Fallo interno inesperado → notificar al usuario |

El mensaje se prefija con la categoría: `[external_error] ELM327 connection error...`

**2. Fail-safe en la capa de transporte, no en MCP**

Los patrones de resiliencia (retry con backoff exponencial, circuit breaker) se implementan en `infrastructure/elm327/tcpTransport.ts`, no en el servidor MCP. La separación de responsabilidades es:

```
MCP tool → ObdRepository → tcpTransport (retry + circuit breaker) → red
 ↑                          ↑
 isError: true              fail-safe patterns
```

- **Retry**: 3 reintentos con backoff (200ms → 400ms → 800ms) en fallos de conexión.
- **Circuit breaker**: tras 5 fallos consecutivos, rechaza comandos durante 30s.
- El MCP solo ve el resultado final (éxito o `isError: true`), sin conocer los detalles de red.

### Flujo de diagnóstico cognitivo

1. El caso de uso `ExecuteCognitiveDiagnosis` recibe una consulta del usuario (HTTP)
2. Construye un prompt con el contexto del vehículo (modelo, año, escenario activo)
3. Inicia una sesión MCP: el LLM recibe las tools disponibles
4. El LLM decide qué tools llamar y en qué orden (razonamiento autónomo)
5. Las tools devuelven datos reales del simulador
6. El LLM sintetiza un diagnóstico narrativo con severidad, causas probables y acciones recomendadas
7. El diagnóstico se devuelve al usuario vía HTTP

### Aislamiento del proveedor de IA

La conexion al LLM se abstrae mediante el patron Port/Adapter (`application/ports/llmClient.port.ts`). Los adaptadores concretos (`AnthropicClient`, `OpenAiClient`) implementan el puerto, permitiendo cambiar de proveedor sin tocar la logica de negocio. Vease ADR 006 para el diseno detallado del multi-proveedor.

## Consecuencias

**Positivas:**

- Demostración impactante en la defensa: el LLM interactúa con el simulador en tiempo real
- Separación clara entre el "qué" (datos del vehículo) y el "juicio" (diagnóstico del LLM)
- MCP es un estándar abierto (Anthropic, 2024) — valor curricular
- Las tools del MCP Server se prueban unitariamente sin llamar al LLM

**Negativas:**

- Dependencia de conexión a internet o API key de Anthropic para la demo
- Latencia añadida por la llamada al LLM (varios segundos)
- El diagnóstico generado por IA no es determinista — puede variar entre ejecuciones
- Coste por token en demo si se hacen muchas llamadas

## Alternativas consideradas

| Alternativa | Razón para descartar |
|---|---|
| **Reglas deterministas puras** | No cumple el objetivo del TFM (IA agéntica); no hay "cognición" |
| **LangChain + herramientas** | MCP es más estándar y demostrable; LangChain añade abstracciones que oscurecen el flujo |
| **Llamada directa a API de OpenAI sin MCP** | MCP aporta el valor añadido de tool calling estandarizado; sin MCP sería solo un chat |
| **Modelo local (Ollama)** | Posible extensión, pero el MCP SDK de Anthropic está optimizado para Claude; un modelo local requeriría adaptación adicional |

## Referencias

- [Model Context Protocol Specification](https://spec.modelcontextprotocol.io) (Anthropic, 2024)
- [MCP Best Practices](https://modelcontextprotocol.info/docs/best-practices/) — arquitectura, error handling, fail-safe patterns
- [MCP Specification — Tool Execution Errors](https://modelcontextprotocol.io/specification/2026-07-28/server/tools#error-handling)
- ADR 001: `001-arquitectura-del-sistema.md` (Clean Architecture base)
- ADR 006: `006-llm-client-adapter.md` (Adaptador multi-proveedor LLM)
- `infrastructure/mcp/mcpServer.ts` — servidor MCP con tools y error handling
- `infrastructure/elm327/tcpTransport.ts` — transporte TCP con retry y circuit breaker
