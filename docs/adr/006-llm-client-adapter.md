# ADR 006: Adaptador de cliente LLM multi-proveedor

**Estado:** Aprobado
**Fecha:** 2026-07-26
**Contexto:** Abstraccion del proveedor de IA para diagnostico cognitivo

---

## Contexto

El ADR 003 establecio el protocolo MCP como estandar de tool calling para el diagnostico cognitivo. Sin embargo, la llamada concreta al LLM quedaba acoplada a un unico proveedor (Anthropic Claude) dentro del caso de uso `executeCognitiveDiagnosis.ts`, con la promesa de que "si se quiere cambiar de proveedor, solo hay que cambiar ese archivo".

Al avanzar a Fase 4, surge la necesidad real de soportar multiples proveedores:

- **Anthropic Claude** — SDK nativo con tool calling via `messages.create`
- **OpenAI y compatibles** (DeepSeek, Groq, Mistral, xAI) — API de chat completions con tool calling

Ambos protocolos de tool calling son semanticamente similares (el LLM decide que tool llamar, el sistema ejecuta, el resultado se envia de vuelta) pero difieren en formato de mensajes, tipos de contenido, y manejo de errores.

## Decision

Se adopta el patron **Port/Adapter** (Hexagonal) para el cliente LLM:

### Arquitectura

```
application/ports/llmClient.port.ts          ← Puerto (interfaz LlmClientPort)
        ↑                       ↑
        │ implements            │ implements
        │                       │
AnthropicClient              OpenAiClient
(anthropicClient.ts)         (openAiClient.ts)
        │                       │
   Anthropic SDK              OpenAI SDK / fetch
```

El puerto define un unico metodo:

```typescript
interface LlmClientPort {
  sendMessage(input: LlmMessageInput): Promise<LlmResponse>
}
```

Donde `LlmMessageInput` contiene: `systemPrompt`, `userMessage`, `tools` (definiciones MCP), y `handler` (ejecutor de herramientas). `LlmResponse` contiene: `text` (diagnostico narrativo) y `toolCalls` (traza completa).

### Componentes del adaptador

| Fichero | Responsabilidad |
|---|---|
| `llmClient.port.ts` | Contrato `LlmClientPort` + tipos `LlmMessageInput`, `LlmResponse`, `ToolCallTrace`, `McpToolDefinition` |
| `anthropicClient.ts` | Implementa `LlmClientPort` con SDK `@anthropic-ai/sdk`, tipo de contenido `tool_use` / `tool_result` |
| `openAiClient.ts` | Implementa `LlmClientPort` con fetch a OpenAI-compatible API, tipo de contenido `tool_calls` |
| `mcpToolAdapter.ts` | Convierte herramientas MCP Zod → JSON Schema para Anthropic |
| `openAiToolAdapter.ts` | Convierte herramientas MCP Zod → JSON Schema para OpenAI |
| `toolDefinitionSchema.ts` | Schema Zod compartido para validar definiciones de herramientas |
| `sdkErrorUtils.ts` | Utilidades de manejo de errores compartidas entre adaptadores |

### Seleccion del adaptador

Se resuelve via variable de entorno `LLM_PROVIDER`:

```env
LLM_PROVIDER=openai           # openai | anthropic
LLM_API_KEY=sk-...            # API key del proveedor
LLM_BASE_URL=                 # URL base (solo openai, por defecto api.openai.com/v1)
LLM_MODEL=gpt-4o              # Modelo a usar
ANTHROPIC_API_KEY=sk-ant-...  # Solo si LLM_PROVIDER=anthropic
```

La factoria en el composition root (`main.ts`) selecciona el adaptador concreto y lo inyecta en los casos de uso.

### Bucle de tool calling

Independiente del proveedor, el flujo es el mismo:

1. El caso de uso llama a `llmClient.sendMessage({ systemPrompt, userMessage, tools, handler })`
2. El adaptador envia el prompt + herramientas al LLM
3. Si el LLM responde con tool calls → el adaptador invoca `handler(name, args)` y envia el resultado de vuelta
4. Repite hasta que el LLM produce texto final (sin tool calls) o se alcanza el limite de iteraciones
5. Devuelve `LlmResponse { text, toolCalls }` con el diagnostico narrativo y la traza

## Consecuencias

**Positivas:**

- Cambiar de proveedor requiere solo cambiar `LLM_PROVIDER` en `.env` — sin tocar codigo
- Anadir un nuevo proveedor (ej. Gemini, Ollama local) solo requiere crear un nuevo adaptador que implemente `LlmClientPort`
- El puerto se prueba con mocks — los adaptadores concretos se prueban unitariamente contra sus SDKs
- Cumple con el principio Open/Closed: abierto a nuevos proveedores, cerrado a modificaciones del puerto

**Negativas:**

- Duplicacion controlada de logica de tool calling entre `anthropicClient.ts` y `openAiClient.ts` (≈70 lineas cada uno)
- Dos schemas de adaptacion de herramientas (`mcpToolAdapter.ts` + `openAiToolAdapter.ts`) que convierten lo mismo a formatos ligeramente distintos
- El manejo de errores difiere entre SDKs (Anthropic lanza `APIError`, OpenAI devuelve HTTP status)

## Alternativas consideradas

| Alternativa | Razon para descartar |
|---|---|
| **Un solo cliente acoplado a Anthropic** | Limita la demo a un proveedor; no demuestra adaptabilidad multi-proveedor para el TFM |
| **LangChain / Vercel AI SDK** | Anaden abstracciones pesadas; MCP + Port/Adapter es mas ligero y educativo |
| **Adapter unico con if/else por proveedor** | Viola Open/Closed; cada nuevo proveedor tocaria codigo existente |
| **Factory function en lugar de clases** | Ambas opciones son validas; se eligio clase por consistencia con el resto de adaptadores del proyecto |

## Referencias

- ADR 003: `003-diagnostico-cognitivo-mcp.md` — protocolo MCP para tool calling
- ADR 001: `001-arquitectura-del-sistema.md` — Clean Architecture base
- `application/ports/llmClient.port.ts` — definicion del puerto
- `infrastructure/llm/anthropicClient.ts` — adaptador Anthropic
- `infrastructure/llm/openAiClient.ts` — adaptador OpenAI-compatible
