## Why

El ADR-007 §7 define 6 tools MCP de conocimiento (`search_similar_pids`, `index_pid`, `search_similar_dtcs`, `index_dtc`, `search_similar_diagnoses`, `index_diagnosis`) que cierran el bucle de auto-aprendizaje: el LLM descubre un PID/DTC desconocido, lo indexa, lo valida contra el vehículo real y lo recuerda para el siguiente vehículo del mismo modelo. Hoy esas 6 tools no existen — `mcpServer.ts` solo registra las 6 tools de diagnóstico OBD-II (`registerDiagnosticTools`), y `pidsIndex`/`dtcsIndex` (instanciados por `add-rag-cognitive-retrieval` en `composition.ts`) no tienen ningún consumidor.

Este cambio es el bloque **3b de 4** del plan RAG. Depende de:
- `add-rag-cognitive-retrieval` (bloque #2): el `KnowledgeStack` de `composition.ts` con `pidsIndex`/`dtcsIndex`/`diagnosisIndex` ya construidos.
- `add-knowledge-confidence-validation` (bloque #3a, este mismo grupo de sesión): `confidenceScale.ts` (confianza inicial por `source`), `ValidateDiscoveredPidUseCase`/`ValidateDiscoveredDtcUseCase` (validación OBD), y los campos `confidence`/`source`/`validated` ya definidos en las tres entradas de conocimiento.

Sin este cambio, la infraestructura de confianza y validación de `add-knowledge-confidence-validation` sigue siendo peso muerto — casos de uso correctos que nadie invoca, exactamente el problema que `add-rag-cognitive-retrieval` ya resolvió para el lado de recuperación de diagnósticos.

## What Changes

### 1. `KnowledgeStack` pasa a ser un tipo de aplicación, no un detalle de `composition.ts`

- `KnowledgeStack` (definido hoy dentro de `composition.ts` por `add-rag-cognitive-retrieval`) se mueve a `application/ports/KnowledgeStack.ts`: `{ pidsIndex: PidVectorRepository; dtcsIndex: DtcVectorRepository; diagnosisIndex: DiagnosisVectorRepository }`. Son tres puertos de aplicación agrupados — no infraestructura. `composition.ts` importa el tipo desde ahí en vez de definirlo localmente; `createKnowledgeStack` no cambia de comportamiento.
- Esto permite que `infrastructure/mcp/mcpServer.ts` reciba el stack sin importar nada de `infrastructure/composition/`, que es la raíz de composición y no debe tener consumidores aguas abajo.

### 2. `createMcpServer` acepta el stack de conocimiento

- `createMcpServer(repo: ObdRepository, vehicleRepo?: VehicleRepository, knowledgeStack?: KnowledgeStack): DiagnosticsMcpServer`. Tercer parámetro opcional, mismo patrón que `vehicleRepo` — no se convierte a objeto de opciones porque solo hay tres dependencias y las tres son ya opcionales salvo `repo`; forzar un objeto aquí no reduce ambigüedad de forma apreciable (a diferencia del caso de `ExecuteCognitiveDiagnosisUseCaseOptions`, con cuatro dependencias del mismo "tipo" posicional).
- Nueva función privada `registerKnowledgeTools(register, stack)`, análoga a `registerDiagnosticTools`. **Se registran las 6 tools solo si `knowledgeStack` está presente.** Si el RAG está caído (`createKnowledgeStack` devolvió `undefined` en `composition.ts`), las tools de conocimiento no aparecen en absoluto: `mcp.listTools()` no las incluye, así que el LLM nunca ve `search_similar_pids` en su lista de tools y nunca intenta invocarlas. Se prefiere sobre "registrarlas y que devuelvan error": una tool que el LLM ve pero que siempre falla es peor señal que una tool que no existe — el LLM no malgasta un turno de tool-calling en algo condenado a fallar, y el prompt de sistema no necesita explicar una excepción.

### 3. Las 6 tools

| Tool | Entrada (Zod) | Comportamiento |
|---|---|---|
| `search_similar_pids` | `{ query: string, manufacturer?: string, model?: string, limit?: number }` | `pidsIndex.search(query, { limit, filter: { manufacturer, model } })`, formatea resultados como texto con distancia + campos |
| `index_pid` | `{ embeddedText, manufacturer, model, source: 'web'\|'mechanic', mode?, pid?, formula?, dataBytes?, minValue?, maxValue? }` | Confianza inicial vía `initialConfidenceFor(source)`. Si vienen `mode`+`pid`+`formula`+`dataBytes`, valida síncronamente contra el vehículo conectado (`ValidateDiscoveredPidUseCase`) antes de indexar — un único `index()` con el resultado final |
| `search_similar_dtcs` | `{ query, manufacturer?, model?, limit? }` | Análogo a `search_similar_pids` sobre `dtcsIndex` |
| `index_dtc` | `{ embeddedText, manufacturer, model, source: 'web'\|'mechanic', code? }` | Si viene `code`, valida contra `readDtcCodes()` (`ValidateDiscoveredDtcUseCase`) antes de indexar |
| `search_similar_diagnoses` | `{ query, manufacturer?, model?, limit? }` | Análogo sobre `diagnosisIndex` |
| `index_diagnosis` | `{ embeddedText, manufacturer, model, symptoms: string[], pidsInvolved: string[] }` | `confidence: initialConfidenceFor(KnowledgeSource.PreviousDiagnosis)` (0.5), `source: KnowledgeSource.PreviousDiagnosis` fijo |

- Las tools de indexado devuelven texto describiendo el resultado (`"Indexed PID ... (confidence 0.7, validated)"` / `"... (confidence 0.3, unvalidated: no vehicle connected)"`), coherente con el resto de tools MCP del servidor (`text(...)`/`errorText(...)`).
- Las tools de búsqueda devuelven `"No results found."` cuando la búsqueda no encuentra nada (mismo patrón que `get_dtc_codes`/`get_available_pids` con listas vacías: respuesta vacía legítima, no `isError`).

### 4. `DiagnosisService` pasa a construir un `KnowledgeStack` único, no un `diagnosisIndex` suelto

- `add-rag-cognitive-retrieval` añadió `diagnosisIndex?: DiagnosisVectorRepository` a `DiagnosisServiceOptions`, consumido solo por `ExecuteCognitiveDiagnosisUseCase` para la recuperación de contexto. Este cambio lo **sustituye** por `knowledgeStack?: KnowledgeStack`: el mismo objeto sirve para pasar `diagnosisIndex` al caso de uso cognitivo (`options.knowledgeStack?.diagnosisIndex`) y para pasar el stack completo a `createMcpServer` en `cognitiveDiagnosis()` y `callMcpTool()`. Se documenta como decisión explícita en `design.md`: dos nombres para overlapping data (`diagnosisIndex` suelto + `knowledgeStack.diagnosisIndex`) sería una fuente de desincronización el día que alguien pase uno sin el otro.
- `composition.ts` pasa `stack` (ya construido por `createKnowledgeStack`, de `add-rag-cognitive-retrieval`) directamente como `knowledgeStack` a `DiagnosisService`, sin destructurar solo `diagnosisIndex`.

## Lo que NO cambia

- `web_search` — bloque `add-web-search-tool`.
- `ValidateDiscoveredPidUseCase`/`ValidateDiscoveredDtcUseCase`/`confidenceScale.ts` — ya entregados por `add-knowledge-confidence-validation`, este cambio solo los invoca.
- La recuperación de contexto en `ExecuteCognitiveDiagnosisUseCase` (búsqueda + indexado del caso resuelto) — sin cambios de comportamiento, solo cambia de dónde lee `diagnosisIndex` (de `options.knowledgeStack?.diagnosisIndex` en vez de `options.diagnosisIndex`).
- Revalidación de una entrada ya indexada tiempo después (sin datos de validación en el momento del primer índice) — no hay tool para ello; ver Non-Goals en `design.md`.
- Las 6 tools de diagnóstico existentes (`read_pid`, `get_dtc_codes`, ...) y su registro — sin cambios.

## Capabilities

### Added Capabilities
- `knowledge-mcp-tools`: el LLM dispone de 6 tools MCP para buscar y ampliar el catálogo auto-expansivo (PIDs, DTCs, diagnósticos) por similitud semántica, con validación OBD síncrona al indexar cuando hay datos suficientes y un vehículo conectado. Las tools no se registran cuando el stack de conocimiento no está disponible.

## Impact

- **Nuevo**: `application/ports/KnowledgeStack.ts`
- **Modificado**: `infrastructure/composition/composition.ts` (importa `KnowledgeStack` en vez de definirlo, pasa `knowledgeStack` a `DiagnosisService`)
- **Modificado**: `infrastructure/mcp/mcpServer.ts` (`registerKnowledgeTools`, `createMcpServer` con tercer parámetro)
- **Modificado**: `infrastructure/services/diagnosisService.ts` (`DiagnosisServiceOptions.diagnosisIndex` → `knowledgeStack`; `ExecuteCognitiveDiagnosisUseCaseOptions` lee `knowledgeStack?.diagnosisIndex`)
- **Modificado**: `application/use-cases/ExecuteCognitiveDiagnosisUseCase.ts` (mismo cambio de origen del dato, sin cambio de comportamiento)
- **Nuevo**: tests de las 6 tools en `mcpServer.test.ts` (o fichero nuevo `mcpKnowledgeTools.test.ts` si el existente crece demasiado)
- **Sin cambios**: `application/use-cases/Validate*UseCase.ts`, `application/knowledge/confidenceScale.ts`, `application/knowledge/createKnowledgeIndex.ts`, mappers de `application/knowledge/`
