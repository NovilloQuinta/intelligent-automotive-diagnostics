## 1. Dependencia `openai` (npm)

- [x] 1.1 Instalar `openai` en `apps/core-api`: `pnpm add openai`
- [x] 1.2 Verificar que `pnpm build` compila sin errores con la nueva dependencia.

## 2. openAiToolAdapter (TDD)

- [x] 2.1 RED: Escribir `tests/unit/infrastructure/llm/openAiToolAdapter.test.ts` con tests para:
  - Conversión básica (`McpToolDefinition` → `{ type: "function", function: { name, description, parameters } }`)
  - Tool sin schema → `parameters` con `{ type: "object", properties: {} }`
  - Array de tools → array de OpenAI ChatCompletionTools
  - Preservación de orden en el array
- [x] 2.2 GREEN: Implementar `src/infrastructure/llm/openAiToolAdapter.ts` como función pura exportada.
  - Validar entrada con Zod (`McpToolDefinitionSchema` reutilizado o similar al de `mcpToolAdapter`).
  - Producir `{ type: "function", function: { name, description, parameters } }`.
- [x] 2.3 REFACTOR: Verificar TSDoc, extraer constantes si es necesario, coverage >= 80%.

## 3. OpenAiClient — Escenarios base (TDD)

- [x] 3.1 RED: Escribir `tests/unit/infrastructure/llm/openAiClient.test.ts` con mock de `openai`. Escenarios:
  - Respuesta texto directa (sin tool calling, `finish_reason: "stop"`)
  - Tool calling simple (1 iteración: tool_calls → tool result → stop)
  - Tool calling múltiple (3 iteraciones)
  - Tool handler lanza error → tool message con mensaje de error
  - Tool desconocida → tool message con `"Unknown tool:"`
- [x] 3.2 GREEN: Implementar `src/infrastructure/llm/openAiClient.ts` con factory `createOpenAiClient`.
  - Timeout 30s por llamada (configurable).
  - Bucle max 10 iteraciones (configurable).
  - Manejo de `finish_reason: "stop"` y `finish_reason: "tool_calls"`.
  - Construcción de mensajes `role: "tool"` con `tool_call_id` y `content`.
  - Validación de configuración con Zod (`OpenAiClientConfigSchema`).
  - NUNCA hardcodear `baseURL` ni `model` para un proveedor específico (usar defaults genéricos).
- [x] 3.3 Verificar que los tests del paso 3.1 pasan en verde.

## 4. OpenAiClient — Límites y errores (TDD)

- [x] 4.1 RED: Ampliar tests para escenarios de error:
  - Límite de iteraciones alcanzado (10 sin `stop`) → `MaxToolCallIterationsError`
  - Límite configurable (ej. `maxIterations: 5`)
  - Timeout de API → `OpenAiTimeoutError`
  - Error de API (4xx/5xx) → `OpenAiApiError`
  - Sanitización de errores: verificar que los mensajes de error NO contienen el `message` crudo del SDK
- [x] 4.2 GREEN: Implementar manejo de errores en el adaptador.
  - `wrapSdkError()`: detecta timeout por `error.name`, status code por `error.status`, sanitiza mensajes.
  - `OpenAiTimeoutError` y `OpenAiApiError` como clases de error propias.
- [x] 4.3 Verificar que todos los tests pasan en verde.

## 5. REFACTOR final

- [x] 5.1 Revisar TSDoc en todas las exportaciones públicas de los 2 archivos nuevos.
- [x] 5.2 Extraer constantes mágicas: timeout por defecto, max iteraciones, modelo por defecto, baseURL por defecto.
- [x] 5.3 Verificar que no hay importación de `openai` en los tests de `openAiToolAdapter` (debe ser independiente del SDK).
- [x] 5.4 Verificar coverage: `pnpm test:coverage` — los nuevos archivos deben cumplir thresholds (>= 80% statements/lines, >= 60% branches, >= 90% functions).
- [x] 5.5 Revisar que no hay imports circulares ni violaciones de capas (infra importa puertos del application, no al revés).
- [x] 5.6 Verificar simetría con `anthropicClient.ts`: mismo patrón de factory, mismo tipo de errores, misma estructura de tests. Las diferencias son solo en el formato de tool calling (Anthropic vs OpenAI), no en la arquitectura.

## 6. Verificación final

- [x] 6.1 Ejecutar `pnpm lint && pnpm format && pnpm test && pnpm build`
- [x] 6.2 Ejecutar `pnpm test:coverage` y verificar thresholds globales.
- [x] 6.3 Actualizar `CLAUDE.md` con el estado de la sesión (Task 2 de Fase 4 completado).
- [x] 6.4 Verificar que el adaptador funciona con al menos dos proveedores documentados (ej. OpenAI y DeepSeek) — test manual o con variables de entorno.
