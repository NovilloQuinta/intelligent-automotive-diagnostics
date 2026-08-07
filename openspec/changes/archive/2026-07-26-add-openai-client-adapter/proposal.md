## Why

Tras implementar el adaptador Anthropic Claude (`add-llm-client-adapter`), el sistema necesita soportar cualquier proveedor compatible con la API de OpenAI para ampliar las opciones de diagnóstico cognitivo vehicular. Muchos proveedores (OpenAI, DeepSeek, Groq, Mistral, xAI, etc.) ofrecen endpoints compatibles con el formato de API de OpenAI, permitiendo cambiar de modelo sin modificar una sola línea de código. Implementar un adaptador genérico `openai`-compatible evita el vendor lock-in y permite al usuario elegir el proveedor que mejor se adapte a sus necesidades de coste, latencia o calidad, simplemente configurando `baseURL` y `model`.

El adaptador antropomórfico `createAnthropicClient` ya existe como referencia de implementación, pero la API de Anthropic tiene un formato de tool calling distinto (`tool_use` / `tool_result` con `is_error`) y usa un SDK propietario. La API de OpenAI y sus compatibles usan `function` calling y respuestas con `tool_calls` + `tool` messages con `tool_call_id`. Ambos comparten el mismo puerto `LlmClientPort`, pero requieren adaptadores separados.

## What Changes

- **Adaptador `createOpenAiClient`**: factory function en `infrastructure/llm/openAiClient.ts` que implementa `LlmClientPort` usando el SDK `openai` (npm package), con timeout de 30s, máximo 10 iteraciones de tool calling, y manejo de errores con sanitización.
- **Adaptador `openAiToolAdapter`**: función pura en `infrastructure/llm/openAiToolAdapter.ts` que convierte schemas MCP (`McpToolDefinition`) al formato `ChatCompletionTool` de OpenAI (`type: "function"`, `function: { name, description, parameters }`).
- **Configuración provider-agnostic**: la factory recibe `baseURL` (por defecto `https://api.openai.com/v1`) y `model` (por defecto `gpt-4o`). NADA está hardcodeado para un proveedor específico. El usuario elige el proveedor configurando estas variables.
- **Nueva dependencia**: `openai` en `apps/core-api/package.json`.
- **Variables de entorno recomendadas**: `LLM_API_KEY`, `LLM_BASE_URL` (opcional), `LLM_MODEL` (opcional).

**IMPORTANTE**: Este adaptador NO es específico de DeepSeek. Es un cliente genérico compatible con la API de OpenAI. Funciona con cualquier proveedor que exponga un endpoint compatible: OpenAI, DeepSeek, Groq, Mistral, xAI, etc. El proveedor se elige mediante configuración (`baseURL` + `model`), no mediante código.

## Capabilities

### New Capabilities
- `llm-openai-client`: Cliente LLM que envía prompts a cualquier API compatible con OpenAI, ejecuta tool calling en bucle (máx. 10 iteraciones), maneja errores de tool, y devuelve diagnóstico narrativo con traza.

## Impact

- Nuevo archivo: `apps/core-api/src/infrastructure/llm/openAiClient.ts` (factory `createOpenAiClient`)
- Nuevo archivo: `apps/core-api/src/infrastructure/llm/openAiToolAdapter.ts` (conversor MCP → OpenAI Tool)
- Nuevo test: `apps/core-api/tests/unit/infrastructure/llm/openAiClient.test.ts`
- Nuevo test: `apps/core-api/tests/unit/infrastructure/llm/openAiToolAdapter.test.ts`
- Modificado: `apps/core-api/package.json` (agregar `openai`)
- Sin cambios en el puerto `LlmClientPort` (ya existe, es provider-agnostic)
- Sin cambios en dominio ni use cases existentes.
