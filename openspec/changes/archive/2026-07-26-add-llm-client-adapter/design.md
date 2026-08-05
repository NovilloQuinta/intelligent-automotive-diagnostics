## Context

Fase 4 del TFM: diagnóstico cognitivo vehicular. El stack actual es TypeScript (ESM, strict), Express 5, Drizzle ORM + SQLite, MCP SDK (`@modelcontextprotocol/sdk`), Clean Architecture + Hexagonal con factory functions y puertos con sufijo `Port`. Las herramientas MCP ya están definidas en `infrastructure/mcp/mcpServer.ts` con schemas Zod. Se necesita un cliente LLM que conecte con Anthropic Claude para razonamiento experto sobre datos de telemetría OBD-II, usando tool calling para consultar información adicional del vehículo.

## Goals / Non-Goals

**Goals:**
- Definir un puerto `LlmClientPort` en `application/ports/` que abstraiga cualquier proveedor LLM.
- Implementar `createAnthropicClient` como factory function que envuelva `@anthropic-ai/sdk`.
- Soportar tool calling cíclico: Claude pide `tool_use` → el adaptador ejecuta el handler → envía `tool_result` → repite hasta que Claude devuelve `text` o se alcanza el límite de 10 iteraciones.
- Convertir definiciones MCP (schemas Zod) al formato `Tool` de Anthropic mediante `mcpToolAdapter`.
- Timeout de 30s por llamada a la API de Anthropic.
- Manejo de errores de tool: reportar a Claude como `tool_result` con `is_error: true` para que pueda adaptar su estrategia.
- Devolver un `LlmResponse` estructurado con el texto final y la traza completa de tool calls.

**Non-Goals:**
- Integración con el use case `processVehicleDiagnosis` (se hará en tareas posteriores de Fase 4).
- Soportar streaming de respuestas (solo modo non-streaming).
- Soportar múltiples proveedores LLM (OpenAI, etc.) — solo Anthropic Claude.
- Manejar rate limiting o reintentos a nivel de API (se delega al SDK de Anthropic).
- Persistir la traza de tool calls (eso lo hará el use case o el repositorio de diagnóstico).

## Decisions

### 1. Puerto `LlmClientPort` en `application/ports/` vs definirlo en dominio
**Elegido**: `application/ports/`. Siguiendo la convención del proyecto, los puertos viven en `application/ports/` y definen contratos que la capa de infraestructura implementa. El dominio no necesita conocer al LLM; las entidades de dominio (`DiagnosisResult`, `CognitiveDiagnosisResult`) ya existen y son el output del use case, no del puerto.

### 2. Factory function `createAnthropicClient(apiKey)` vs clase `AnthropicClient`
**Elegido**: Factory function. El proyecto usa exclusivamente factory functions (`createAuthService`, `createMcpServer`, `createRateLimiter`). No hay clases en ninguna capa. La factory recibe como mínimo la API key y opcionalmente configuración de timeout e iteraciones máximas, y devuelve un objeto que satisface `LlmClientPort`.

### 3. Tool adapter como función pura vs integrado en el cliente
**Elegido**: Función pura `mcpToolAdapter` en archivo separado. Convierte `{ name, description, schema: ZodObject }` → `{ name, description, input_schema }` (formato Anthropic). Separarlo permite testear la conversión aisladamente y reutilizarla si en el futuro se añade otro proveedor LLM.

### 4. Bucle de tool calling: interno al cliente vs externo (use case)
**Elegido**: Interno al cliente. El puerto `LlmClientPort` expone un solo método `sendMessage` que recibe tools + handler y devuelve `LlmResponse`. El bucle (máx. 10 iteraciones) está encapsulado en el adaptador. Esto simplifica el use case, que solo llama a `sendMessage` y recibe el resultado completo.

### 5. Errores de tool: excepción vs tool_result con is_error
**Elegido**: `tool_result` con `is_error: true`. Si el handler lanza una excepción, el adaptador la captura, construye un `tool_result` con `is_error: true` y el mensaje de error, y lo envía a Claude. Esto permite que Claude reciba feedback y reformule su approach (ej. pedir otra tool o dar un diagnóstico parcial). Si el handler falla, NO se aborta el bucle; se continúa hasta que Claude devuelva `text` o se agoten las iteraciones.

### 6. Timeout: 30s por llamada HTTP vs timeout global del bucle
**Elegido**: 30s por llamada individual a la API de Anthropic. Configurable via `AnthropicClientConfig`. Si una llamada excede 30s, se lanza error. El bucle completo no tiene timeout adicional porque cada iteración ya está acotada.

### 7. Máximo de iteraciones: 10 vs configurable sin límite
**Elegido**: 10 iteraciones, configurable via `AnthropicClientConfig` (default 10). Un límite previene bucles infinitos si Claude entra en un ciclo de tool calling erróneo. Al alcanzar el límite, se lanza un error específico `MaxToolCallIterationsError`.

### 8. Mock del SDK de Anthropic en tests
**Elegido**: Mock de `@anthropic-ai/sdk` usando Vitest (`vi.mock`). El mock simula `messages.create` para los escenarios: respuesta texto directo, tool_use → tool_result → texto, tool_use con error → tool_result is_error → texto, y límite de iteraciones. No se mockea el puerto (eso sería anti-patrón); se mockea la dependencia externa (SDK HTTP).

## Data Flow

```
Use Case (future)
  │
  │ llama a sendMessage(systemPrompt, userMessage, tools, handler)
  ▼
LlmClientPort.sendMessage()
  │
  ▼
createAnthropicClient (infrastructure/llm/)
  │
  │ 1. Convierte tools MCP → Anthropic Tool format (via mcpToolAdapter)
  │ 2. Construye mensaje inicial: system + user
  │
  ▼
  ┌─────────────────────────────────────────────┐
  │ BUCLE (máx. 10 iteraciones)                  │
  │                                               │
  │  Anthropic API (messages.create)              │
  │    │                                          │
  │    ├─ stop_reason: "end_turn" (texto final)   │
  │    │  → Sale del bucle, devuelve LlmResponse  │
  │    │                                          │
  │    └─ stop_reason: "tool_use"                 │
  │       → Extrae tool_use blocks                │
  │       → Ejecuta handler(name, args) por cada  │
  │       → Si handler falla: tool_result con     │
  │         is_error: true                        │
  │       → Añade tool_result al historial        │
  │       → Vuelve a llamar a Anthropic API       │
  └─────────────────────────────────────────────┘
  │
  ▼
LlmResponse { text, toolCalls: ToolCallTrace[] }
```

## Data Model

### LlmClientPort (application/ports/llmClient.port.ts)
```typescript
interface LlmClientPort {
  sendMessage(input: LlmMessageInput): Promise<LlmResponse>;
}

interface LlmMessageInput {
  systemPrompt: string;
  userMessage: string;
  tools: McpToolDefinition[];
  handler: ToolCallHandler;
}

interface LlmResponse {
  text: string;
  toolCalls: ToolCallTrace[];
}

type ToolCallHandler = (name: string, args: Record<string, unknown>) => Promise<string>;

interface McpToolDefinition {
  name: string;
  description: string;
  schema: Record<string, unknown>; // Zod schema serializado
}
```

### AnthropicClientConfig
```typescript
interface AnthropicClientConfig {
  apiKey: string;
  model?: string;           // default: "claude-sonnet-4-20250514"
  maxIterations?: number;   // default: 10
  timeoutMs?: number;       // default: 30_000
}
```

## Error Handling

| Error | Causa | Comportamiento |
|---|---|---|
| `AnthropicApiError` | API responde con error (4xx, 5xx) | Se propaga al caller. No se reintenta. |
| `AnthropicTimeoutError` | Llamada excede `timeoutMs` | Se propaga al caller. |
| `MaxToolCallIterationsError` | Bucle alcanza `maxIterations` sin texto final | Se lanza con la traza parcial de tool calls. |
| Tool handler lanza excepción | Handler falla al ejecutar tool MCP | Se captura, se envía `tool_result` con `is_error: true`. El bucle continúa. |
| Tool no encontrada | Claude pide una tool no registrada | Se envía `tool_result` con `is_error: true` indicando tool desconocida. El bucle continúa. |

## Risks / Trade-offs

- [Dependencia de `@anthropic-ai/sdk`] → El SDK de Anthropic es la dependencia canónica. Si cambia su API, el adaptador debe actualizarse. Mitigación: el puerto `LlmClientPort` aísla el resto del sistema.
- [Tool calling infinito con tool errors] → Si todas las tools fallan y Claude insiste en tool_use, el bucle llega a 10 iteraciones y lanza `MaxToolCallIterationsError`. Mitigación: aceptable; 10 iteraciones es generoso y el error es explícito.
- [Mock del SDK en tests] → Los tests dependen del comportamiento del mock, no del SDK real. Mitigación: los tests de integración (futuros) validarán contra una API key real o un mock server. Los tests unitarios validan la lógica de orquestación (bucle, manejo de errores, formato de respuesta).
