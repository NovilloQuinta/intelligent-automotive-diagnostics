## Context

Fase 4 del TFM: diagnóstico cognitivo vehicular. El stack actual es TypeScript (ESM, strict), Express 5, Drizzle ORM + SQLite, MCP SDK (`@modelcontextprotocol/sdk`), Clean Architecture + Hexagonal con factory functions y puertos con sufijo `Port`. Ya existe el puerto `LlmClientPort` en `application/ports/llmClient.port.ts` (provider-agnostic) y el adaptador `createAnthropicClient` para Anthropic Claude. Las herramientas MCP están definidas en `infrastructure/mcp/mcpServer.ts` con schemas Zod.

Se necesita un segundo adaptador que implemente `LlmClientPort` usando el SDK `openai` (npm package), compatible con cualquier proveedor que exponga una API con formato OpenAI (OpenAI, DeepSeek, Groq, Mistral, xAI, etc.). El adaptador DEBE ser provider-agnostic: el proveedor se elige mediante configuración (`baseURL` + `model`), no mediante constantes hardcodeadas.

## Goals / Non-Goals

**Goals:**
- Implementar `createOpenAiClient` como factory function que envuelva el SDK `openai`.
- Soportar tool calling cíclico: el LLM responde con `finish_reason: "tool_calls"` → el adaptador ejecuta el handler → envía `role: "tool"` con `tool_call_id` → repite hasta que el LLM devuelve `finish_reason: "stop"` o se alcanza el límite de 10 iteraciones.
- Convertir definiciones MCP (`McpToolDefinition`) al formato `ChatCompletionTool` de OpenAI mediante `openAiToolAdapter`.
- Ser provider-agnostic: `baseURL` y `model` vienen de configuración, con defaults sensatos (`https://api.openai.com/v1` y `gpt-4o`) pero NUNCA hardcodeados para un proveedor específico.
- Timeout de 30s por llamada a la API.
- Manejo de errores de tool: reportar al LLM como `role: "tool"` con mensaje de error en `content` para que pueda adaptar su estrategia.
- Devolver un `LlmResponse` estructurado con el texto final y la traza completa de tool calls.
- Sanitización de errores del SDK: nunca exponer mensajes internos en las respuestas de error (OWASP A09).

**Non-Goals:**
- Integración con el use case `processVehicleDiagnosis` (se hará en tareas posteriores de Fase 4).
- Soportar streaming de respuestas (solo modo non-streaming).
- Soportar proveedores con APIs no compatibles con OpenAI (ej. Anthropic, que ya tiene su propio adaptador).
- Manejar rate limiting o reintentos a nivel de API (se delega al SDK de OpenAI).
- Persistir la traza de tool calls (eso lo hará el use case o el repositorio de diagnóstico).
- Hardcodear configuraciones para DeepSeek o cualquier otro proveedor específico.

## Decisions

### 1. Provider-agnostic: `baseURL` + `model` desde configuración, NO constantes hardcodeadas

**Elegido**: La factory `createOpenAiClient` recibe `{ apiKey, baseURL?, model? }` con defaults genéricos (`https://api.openai.com/v1`, `gpt-4o`). El usuario configura el proveedor deseado estableciendo `LLM_BASE_URL` (ej. `https://api.deepseek.com/v1`) y `LLM_MODEL` (ej. `deepseek-chat`). Esto permite usar DeepSeek, Groq, Mistral, xAI o cualquier otro proveedor compatible sin tocar el código del adaptador. NUNCA se debe hardcodear URLs ni nombres de modelos específicos de proveedores.

**Rechazado**: Crear un adaptador específico para DeepSeek (`createDeepSeekClient`). Esto generaría duplicación de código (misma lógica de tool calling, solo cambia la URL) y forzaría crear un adaptador nuevo por cada proveedor. Con el enfoque genérico, un solo adaptador cubre todos los proveedores OpenAI-compatibles.

### 2. SDK `openai` (npm) vs cliente HTTP genérico

**Elegido**: SDK oficial `openai` (npm). Es el SDK canónico para la API de OpenAI y es compatible con cualquier proveedor que exponga un endpoint OpenAI-compatible (basta con pasar `baseURL` al constructor del cliente). Provee tipos TypeScript completos (`ChatCompletionMessageParam`, `ChatCompletionTool`, etc.) y manejo de errores tipado. Además, es mantenido activamente y usado masivamente en producción.

### 3. Factory function `createOpenAiClient(config)` vs clase `OpenAiClient`

**Elegido**: Factory function. Siguiendo el patrón del proyecto (solo factory functions, sin clases). La factory recibe configuración validada con Zod y devuelve un objeto que satisface `LlmClientPort`. Mismo patrón que `createAnthropicClient`.

### 4. Tool adapter separado: `openAiToolAdapter` como función pura

**Elegido**: Función pura `openAiToolAdapter` en archivo separado (`openAiToolAdapter.ts`). Convierte `McpToolDefinition` → `ChatCompletionTool` de OpenAI (`{ type: "function", function: { name, description, parameters } }`). Separarlo permite testear la conversión aisladamente y mantener la simetría con `mcpToolAdapter` (usado por Anthropic). Aunque ambos adaptadores convierten del mismo input, producen formatos distintos (Anthropic usa `input_schema`, OpenAI usa `parameters` dentro de `function`).

### 5. Bucle de tool calling: interno al cliente

**Elegido**: Interno al cliente. El bucle (máx. 10 iteraciones) está encapsulado en `sendMessage`. El use case solo llama a `sendMessage` y recibe `LlmResponse`. Mismo patrón que Anthropic.

### 6. Errores de tool: mensaje de error en `content`, sin `is_error`

**Elegido**: La API de OpenAI NO tiene un campo `is_error` en los tool messages (a diferencia de Anthropic). Cuando el handler falla, se envía un mensaje con `role: "tool"`, el `tool_call_id` correspondiente, y el `content` con el mensaje de error (ej. `"Tool execution failed: tool_name"`). El LLM interpreta el contenido para decidir si reintentar o dar un diagnóstico parcial. Si el handler falla, NO se aborta el bucle; se continúa hasta que el LLM devuelva `finish_reason: "stop"` o se agoten las iteraciones.

### 7. Timeout: 30s por llamada, configurable

**Elegido**: 30s por llamada individual a la API. Configurable via `config.timeoutMs`. Mismo criterio que Anthropic.

### 8. Límite de iteraciones: 10 por defecto

**Elegido**: 10 iteraciones, configurable via `config.maxIterations`. Al alcanzar el límite, se lanza `MaxToolCallIterationsError` con la traza parcial. Mismo criterio que Anthropic.

### 9. Mock del SDK `openai` en tests

**Elegido**: Mock de `openai` usando Vitest (`vi.mock`). Se mockea `client.chat.completions.create` para los escenarios: respuesta texto directo, tool_calls → tool result → texto, tool con error, y límite de iteraciones. Mismo patrón que Anthropic.

### 10. Streaming vs non-streaming

**Elegido**: `stream: false` (modo non-streaming). Simplifica el manejo de tool calling (las tool calls llegan completas en una sola respuesta). Mismo criterio que Anthropic.

## Data Flow

```
Use Case (future)
  │
  │ llama a sendMessage(systemPrompt, userMessage, tools, handler)
  ▼
LlmClientPort.sendMessage()
  │
  ▼
createOpenAiClient (infrastructure/llm/)
  │
  │ 1. Convierte tools MCP → OpenAI ChatCompletionTool (via openAiToolAdapter)
  │ 2. Construye el array de mensajes: system + user
  │ 3. Asigna system prompt como primer mensaje (role: "system")
  │
  ▼
  ┌─────────────────────────────────────────────┐
  │ BUCLE (máx. 10 iteraciones)                  │
  │                                               │
  │  OpenAI API (client.chat.completions.create)  │
  │    │                                          │
  │    ├─ finish_reason: "stop" → texto final     │
  │    │  → Sale del bucle, devuelve LlmResponse  │
  │    │                                          │
  │    └─ finish_reason: "tool_calls"             │
  │       → Extrae tool_calls del mensaje         │
  │       → Ejecuta handler(name, args) por cada  │
  │       → Construye mensajes role: "tool" con   │
  │         tool_call_id + content                │
  │       → Agrega assistant message + tool       │
  │         messages al historial                 │
  │       → Vuelve a llamar a OpenAI API          │
  └─────────────────────────────────────────────┘
  │
  ▼
LlmResponse { text, toolCalls: ToolCallTrace[] }
```

## Data Model

### OpenAiClientConfig
```typescript
interface OpenAiClientConfig {
  apiKey: string;           // API key del proveedor (obligatoria)
  baseURL?: string;         // URL base del endpoint (default: https://api.openai.com/v1)
  model?: string;           // Modelo a utilizar (default: gpt-4o)
  maxIterations?: number;   // Máximo de iteraciones de tool calling (default: 10)
  timeoutMs?: number;       // Timeout en ms por llamada (default: 30_000)
}
```

### Formato de tool (OpenAI ChatCompletionTool)
```typescript
// Entrada: McpToolDefinition (del puerto LlmClientPort)
// Salida: { type: "function", function: { name, description, parameters } }
interface OpenAiTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;  // JSON Schema
  };
}
```

### Ciclo de mensajes (formato OpenAI)
```typescript
// Mensaje inicial
{ role: "system", content: systemPrompt }
{ role: "user", content: userMessage }

// Respuesta del LLM con tool_calls → se agrega al historial
{ role: "assistant", content: null, tool_calls: [...] }

// Resultado de cada tool → se agrega al historial
{ role: "tool", tool_call_id: "call_xxx", content: "resultado" }

// Siguiente iteración: el LLM recibe todo el historial
```

## Error Handling

| Error | Causa | Comportamiento |
|---|---|---|
| `OpenAiApiError` | API responde con error (4xx, 5xx) | Se propaga al caller. No se reintenta. Mensaje sanitizado (nunca se expone el error crudo del SDK). |
| `OpenAiTimeoutError` | Llamada excede `timeoutMs` | Se propaga al caller. |
| `MaxToolCallIterationsError` | Bucle alcanza `maxIterations` sin `finish_reason: "stop"` | Se lanza con la traza parcial de tool calls. |
| Tool handler lanza excepción | Handler falla al ejecutar tool MCP | Se captura, se envía mensaje `role: "tool"` con contenido de error. El bucle continúa. |
| Tool no encontrada | LLM pide una tool no registrada | Se envía mensaje `role: "tool"` con `"Unknown tool: tool_name"`. El bucle continúa. |

## Risks / Trade-offs

- [Dependencia del SDK `openai`] → El SDK es la dependencia canónica para la API de OpenAI y es ampliamente usado en producción. Si cambia su API, el adaptador debe actualizarse. Mitigación: el puerto `LlmClientPort` aísla el resto del sistema.
- [Compatibilidad con proveedores no-OpenAI] → No todos los proveedores implementan el 100% de la API de OpenAI. Algunos pueden no soportar tool calling, o tener límites distintos. Mitigación: el adaptador usa solo características básicas de la API (chat completions con tools, sin streaming, sin paralelismo de tools). Esto maximiza la compatibilidad. Si un proveedor específico requiere ajustes, el `baseURL` y `model` configurables permiten cambiarlo sin tocar código.
- [Diferencia en `is_error` vs Anthropic] → La API de OpenAI no tiene campo `is_error`. El LLM interpreta el contenido del tool message para detectar errores. Esto es menos explícito que Anthropic, pero es el comportamiento estándar de OpenAI. Mitigación: los mensajes de error usan prefijos claros (`"Tool execution failed:"`, `"Unknown tool:"`) para facilitar la interpretación del LLM.
- [Mock del SDK en tests] → Los tests dependen del comportamiento del mock, no del SDK real. Mitigación: los tests unitarios validan la lógica de orquestación (bucle, manejo de errores, formato de respuesta). Tests de integración futuros validarán contra un endpoint real o mock server.
- [Tool calling paralelo] → OpenAI puede devolver múltiples tool calls en una sola respuesta. El adaptador las procesa secuencialmente (en orden), no en paralelo. Si dos tools son independientes, esto añade latencia. Para la primera versión, el procesamiento secuencial es aceptable (simplicidad > rendimiento). Futura mejora: soportar ejecución paralela de tool calls independientes.
