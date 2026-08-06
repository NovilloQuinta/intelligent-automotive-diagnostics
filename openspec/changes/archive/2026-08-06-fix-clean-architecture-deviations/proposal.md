## Why

La auditoría de Clean Architecture + Hexagonal del 2026-08-06 encontró dos desviaciones que rompen la consistencia del patrón de inyección de dependencias:

1. **`DiagnosisController` crea casos de uso inline** (`ProcessVehicleDiagnosisUseCase` en `diagnose()` y `ExecuteCognitiveDiagnosisUseCase` en `cognitiveDiagnosis()`), mientras que `AuthController` los recibe correctamente por constructor. El controlador actúa como mini-composition-root, mezclando resolución de repositorios, creación de casos de uso y HTTP.

2. **`ExecuteLlmToolCalling` usa `console.error` directo** en la capa de aplicación, cuando el proyecto ya tiene `LoggerPort` inyectado en el resto de casos de uso (`RegisterUserUseCase`, `LoginUserUseCase`, etc.).

Ambas rompen la regla: "la capa de aplicación no debe instanciar infraestructura ni acoplarse a APIs de plataforma".

## What Changes

### 1. Extraer `DiagnosisService` a `infrastructure/services/`

- **Nuevo**: `infrastructure/services/diagnosisService.ts` — clase que encapsula la resolución dinámica de repositorios (simulación vs TCP), la creación de casos de uso y la orquestación de MCP. Expone `diagnose()`, `cognitiveDiagnosis()`, `callMcpTool()`, `listScenarios()` y `resolveRepository()`.
- **Modificado**: `DiagnosisController` — recibe `DiagnosisService` por constructor. Se limita a parsear requests, delegar al servicio, y formatear respuestas HTTP (mismo patrón que `AuthController`).
- **Modificado**: `composition.ts` — crea `DiagnosisService` y lo inyecta en `DiagnosisController`.
- **Modificado**: `server.ts` — `createDiagnosisRoutes` recibe `DiagnosisController` en vez de dependencias sueltas.
- **Modificado**: `diagnosis.routes.ts` — recibe `DiagnosisController` en vez de crear uno internamente.

### 2. Inyectar `LoggerPort` en `ExecuteLlmToolCalling`

- **Modificado**: `ExecuteLlmToolCalling` — recibe `LoggerPort` por constructor. Sustituye `console.error` por `this.logger.error()`.
- **Modificado**: `composeLlmClient.ts` — recibe y reenvía `LoggerPort` al use case.
- **Modificado**: `createAnthropicClient()` y `createOpenAiClient()` — aceptan `logger` opcional en su config.
- **Modificado**: `composition.ts` — pasa `logger` a los clientes LLM.

## Capabilities

### New Capabilities
- `diagnosis-service`: Servicio de orquestación de diagnóstico en `infrastructure/services/` que encapsula resolución de repositorios, creación de casos de uso e integración MCP.

### Modified Capabilities
- `execute-cognitive-diagnosis`: El use case `ExecuteCognitiveDiagnosisUseCase` no cambia su firma. Su instanciación se mueve del controlador al `DiagnosisService`.
- `llm-client-adapter`: `ExecuteLlmToolCalling` recibe `LoggerPort`. `composeLlmClient`, `createAnthropicClient` y `createOpenAiClient` propagan el logger.

## Impact

- **Nuevo**: `apps/core-api/src/infrastructure/services/diagnosisService.ts`
- **Nuevo**: `apps/core-api/tests/unit/infrastructure/services/diagnosisService.test.ts`
- **Modificado**: `apps/core-api/src/infrastructure/http/controllers/DiagnosisController.ts` (de ~270 a ~120 líneas)
- **Modificado**: `apps/core-api/src/infrastructure/http/routes/diagnosis.routes.ts`
- **Modificado**: `apps/core-api/src/infrastructure/http/server.ts`
- **Modificado**: `apps/core-api/src/infrastructure/composition/composition.ts`
- **Modificado**: `apps/core-api/src/application/use-cases/ExecuteLlmToolCalling.ts` (+ `LoggerPort`)
- **Modificado**: `apps/core-api/src/infrastructure/llm/composeLlmClient.ts` (+ `logger` param)
- **Modificado**: `apps/core-api/src/infrastructure/llm/anthropicClient.ts` (+ `logger` en config)
- **Modificado**: `apps/core-api/src/infrastructure/llm/openAiClient.ts` (+ `logger` en config)
- **Modificado**: `apps/core-api/tests/unit/usecases/llm/executeLlmToolCalling.test.ts` (mock logger)
- **Modificado**: `apps/core-api/tests/unit/infrastructure/http/routes/diagnosis.routes.test.ts`
- **Sin cambios**: Puertos (`LlmClientPort`, `ObdRepository`, `ToolCallHandler`, `LoggerPort`), entidades de dominio, DTOs, `ProcessVehicleDiagnosisUseCase`, `ExecuteCognitiveDiagnosisUseCase`, `createLlmAdapter.ts`, MCP server.
