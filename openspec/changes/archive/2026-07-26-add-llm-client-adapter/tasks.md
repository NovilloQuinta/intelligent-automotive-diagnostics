## 1. Puerto LlmClientPort

- [x] 1.1 Crear `src/application/ports/llmClient.port.ts` con la interfaz `LlmClientPort`, tipos `LlmMessageInput`, `LlmResponse`, `ToolCallHandler`, `McpToolDefinition` y `LlmResponse`. Incluir TSDoc completo en todas las exportaciones públicas.
- [x] 1.2 Verificar que el puerto no importa ninguna dependencia de infraestructura (cumple Clean Architecture).

## 2. Dependencia @anthropic-ai/sdk

- [x] 2.1 Instalar `@anthropic-ai/sdk` en `apps/core-api`: `pnpm add @anthropic-ai/sdk`
- [x] 2.2 Verificar que `pnpm build` compila sin errores con la nueva dependencia.

## 3. mcpToolAdapter (TDD)

- [x] 3.1 RED: Escribir `tests/unit/infrastructure/llm/mcpToolAdapter.test.ts` con tests para:
  - Conversión básica (Zod schema → Anthropic Tool format)
  - Tool sin schema → `input_schema` vacío
  - Array de tools → array de Anthropic Tools
  - Preservación de orden en el array
- [x] 3.2 GREEN: Implementar `src/infrastructure/llm/mcpToolAdapter.ts` como función pura exportada.
- [x] 3.3 REFACTOR: Verificar TSDoc, extraer constantes si es necesario, coverage >= 80%.

## 4. AnthropicClient — Escenarios base (TDD)

- [x] 4.1 RED: Escribir `tests/unit/infrastructure/llm/anthropicClient.test.ts` con mock de `@anthropic-ai/sdk`. Escenarios:
  - Respuesta texto directa (sin tool calling)
  - Tool calling simple (1 iteración)
  - Tool calling múltiple (3 iteraciones)
  - Tool handler lanza error → `is_error: true`
  - Tool desconocida → `is_error: true`
- [x] 4.2 GREEN: Implementar `src/infrastructure/llm/anthropicClient.ts` con factory `createAnthropicClient`.
  - Timeout 30s por llamada (configurable).
  - Bucle max 10 iteraciones (configurable).
  - Manejo de `stop_reason: "end_turn"` y `"tool_use"`.
  - Construcción de `tool_result` con `is_error` cuando el handler falla.
- [x] 4.3 Verificar que los tests del paso 4.1 pasan en verde.

## 5. AnthropicClient — Límites y errores (TDD)

- [x] 5.1 RED: Ampliar tests para escenarios de error:
  - Límite de iteraciones alcanzado (10 sin texto) → `MaxToolCallIterationsError`
  - Límite configurable (ej. `maxIterations: 5`)
  - Timeout de API → `AnthropicTimeoutError`
  - Error de API (4xx/5xx) → `AnthropicApiError`
- [x] 5.2 GREEN: Implementar manejo de errores en el adaptador.
- [x] 5.3 Verificar que todos los tests pasan en verde.

## 6. REFACTOR final

- [x] 6.1 Revisar TSDoc en todas las exportaciones públicas de los 3 archivos nuevos.
- [x] 6.2 Extraer constantes mágicas: timeout por defecto, max iteraciones, nombre de modelo.
- [x] 6.3 Mover la interfaz `ToolCallTrace` existente en `infrastructure/mcp/toolCallTrace.ts` a `application/ports/llmClient.port.ts` si es necesario, o reutilizarla importándola (la traza es la misma interfaz).
- [x] 6.4 Verificar coverage: `pnpm test:coverage` — los nuevos archivos deben cumplir thresholds (>= 80% statements/lines, >= 60% branches, >= 90% functions).
- [x] 6.5 Revisar que no hay imports circulares ni violaciones de capas (infra no importa dominio directamente, solo puertos).

## 7. Verificación final

- [x] 7.1 Ejecutar `pnpm lint && pnpm format && pnpm test && pnpm build`
- [x] 7.2 Ejecutar `pnpm test:coverage` y verificar thresholds globales.
- [x] 7.3 Actualizar `CLAUDE.md` con el estado de la sesión (Task 1 de Fase 4 completado).
