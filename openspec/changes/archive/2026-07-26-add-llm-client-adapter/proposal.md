## Why

La Fase 4 del proyecto requiere diagnóstico cognitivo vehicular mediante LLM. Para que el use case `processVehicleDiagnosis` o un futuro `diagnoseWithCognitiveAgent` pueda delegar el razonamiento clínico al modelo Anthropic Claude, necesitamos un adaptador que encapsule la API de Anthropic, maneje el ciclo de tool calling (tool_use → tool_result) y devuelva un resultado estructurado con traza de herramientas. Sin este adaptador, el sistema depende exclusivamente de diagnósticos deterministas sin capacidad de razonamiento experto.

## What Changes

- **Puerto `LlmClientPort`**: contrato en `application/ports/` que define la operación `sendMessage` (prompt del sistema + mensaje de usuario + tools + handler → resultado estructurado).
- **Adaptador `createAnthropicClient`**: implementación en `infrastructure/llm/` que usa `@anthropic-ai/sdk` como factory function, con timeout de 30s por llamada, máximo 10 iteraciones de tool calling, y reporte de errores de tool a Claude como `tool_result` con `is_error: true`.
- **Adaptador `mcpToolAdapter`**: función pura en `infrastructure/llm/` que convierte schemas Zod de herramientas MCP al formato `Tool` esperado por Anthropic (`name`, `description`, `input_schema`).
- **Nueva dependencia**: `@anthropic-ai/sdk` en `apps/core-api/package.json`.

## Capabilities

### New Capabilities
- `llm-client-adapter`: Cliente LLM que envía prompts a Claude, ejecuta tool calling en bucle (máx. 10 iteraciones), maneja errores de tool, y devuelve diagnóstico narrativo con traza.

## Impact

- Nuevo archivo: `apps/core-api/src/application/ports/llmClient.port.ts` (contrato)
- Nuevo archivo: `apps/core-api/src/infrastructure/llm/anthropicClient.ts` (factory `createAnthropicClient`)
- Nuevo archivo: `apps/core-api/src/infrastructure/llm/mcpToolAdapter.ts` (conversor Zod → Anthropic Tool)
- Nuevo test: `apps/core-api/tests/unit/infrastructure/llm/anthropicClient.test.ts`
- Nuevo test: `apps/core-api/tests/unit/infrastructure/llm/mcpToolAdapter.test.ts`
- Modificado: `apps/core-api/package.json` (agregar `@anthropic-ai/sdk`)
- Sin cambios en dominio ni en use cases existentes (el adaptador es standalone, se integrará en tareas posteriores de Fase 4)
