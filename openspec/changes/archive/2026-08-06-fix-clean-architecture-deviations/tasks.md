## 0. Preparación

- [x] 0.1 Crear rama `fix/clean-architecture-deviations` desde `main`
- [x] 0.2 Verificar baseline: `pnpm lint && pnpm test && pnpm build` verdes en `main`

## 1. Inyectar `LoggerPort` en `ExecuteLlmToolCalling` (TDD)

- [x] 1.1 RED: Actualizar `tests/unit/usecases/llm/executeLlmToolCalling.test.ts`:
  - Crear mock `LoggerPort` (`vi.fn()` para `error`, `warn`, `info`, `debug`)
  - Pasar mock logger como tercer parámetro del constructor
  - En el test de tool handler error: verificar que `logger.error` fue llamado con el mensaje correcto en vez de espiar `console.error`
  - Verificar que la suite falla (el constructor actual espera 2 parámetros)
- [x] 1.2 GREEN: Modificar `ExecuteLlmToolCalling`:
  - Añadir `LoggerPort` como tercer parámetro del constructor
  - Sustituir `console.error(...)` por `this.logger.error(...)`
- [x] 1.3 REFACTOR: Revisar que no quede ningún `console.*` en el fichero
- [x] 1.4 Propagación en `composeLlmClient.ts`:
  - Añadir `logger: LoggerPort` como tercer parámetro
  - Pasarlo al constructor de `ExecuteLlmToolCalling`
- [x] 1.5 Propagación en `anthropicClient.ts`:
  - Añadir `logger?: LoggerPort` a `AnthropicClientConfig`
  - Pasar `config.logger ?? console` a `composeLlmClient`
- [x] 1.6 Propagación en `openAiClient.ts`:
  - Añadir `logger?: LoggerPort` a `OpenAiClientConfig`
  - Pasar `config.logger ?? console` a `composeLlmClient`
- [x] 1.7 Propagación en `composition.ts`:
  - Pasar `logger` en `createAnthropicClient({ ..., logger })` y `createOpenAiClient({ ..., logger })`
- [x] 1.8 Suite completa verde + `pnpm lint`

## 2. Extraer `DiagnosisService` (TDD)

- [x] 2.1 RED: Crear `tests/unit/infrastructure/services/diagnosisService.test.ts`:
  - Test `listScenarios()` en modo simulación: devuelve los scenarios del constructor
  - Test `listScenarios()` en modo TCP: devuelve `[TCP_DIRECT_SCENARIO]` (mover la constante aquí)
  - Test `diagnose(scenarioId)` con scenario existente: crea `ObdSimulatorRepository`, ejecuta diagnóstico, devuelve resultado con `parsedValues`, `dtcCodes`, `diagnosisText`, `severity`
  - Test `diagnose(scenarioId)` con scenario inexistente: lanza `DiagnosisScenarioNotFoundError`
  - Test `diagnose()` en modo TCP (sin scenarioId, con `obdRepo`): usa el repo TCP directamente
  - Test `cognitiveDiagnosis()` sin `llmClient`: lanza `CognitiveDiagnosisUnavailableError`
  - Test `cognitiveDiagnosis(scenarioId, query)`: verifica que crea MCP server, ejecuta use case, devuelve `ExecuteCognitiveDiagnosisOutput`
  - Test `callMcpTool(toolName, scenarioId, args)`: verifica que llama al MCP server y devuelve resultado
  - Test `callMcpTool` con tool inexistente: lanza error
- [x] 2.2 GREEN: Crear `src/infrastructure/services/diagnosisService.ts`:
  - Definir `DiagnosisScenarioNotFoundError` y `CognitiveDiagnosisUnavailableError`
  - Mover `TCP_DIRECT_SCENARIO` desde `DiagnosisController`
  - Implementar `DiagnosisService` con los 4 métodos públicos
  - `diagnose()`: resuelve repo → `new ProcessVehicleDiagnosisUseCase(repo)` → `execute()` → formatea resultado (mover `buildDiagnosisText` desde el controlador)
  - `cognitiveDiagnosis()`: resuelve repo → `createMcpServer(repo)` → `new ExecuteCognitiveDiagnosisUseCase(llmClient, tools, handler)` → `execute()`
  - `callMcpTool()`: resuelve repo → `createMcpServer(repo)` → `callTool()`
- [x] 2.3 Suite del servicio verde + `pnpm lint`

## 3. Refactor `DiagnosisController` para recibir `DiagnosisService` (REFACTOR)

- [x] 3.1 Actualizar `DiagnosisController`:
  - Constructor recibe `DiagnosisService` en vez de `DiagnosisControllerDeps`
  - `listScenarios` delega a `this.service.listScenarios()`
  - `diagnose`: parsea body con Zod → `this.service.diagnose(scenarioId)` → responde 200
  - `mcpTool`: parsea params + body → `this.service.callMcpTool(toolName, scenarioId, args)` → responde 200
  - `cognitiveDiagnosis`: parsea body → `this.service.cognitiveDiagnosis({ scenarioId, userQuery })` → responde 200
  - Eliminar: `resolveRepository()`, `buildDiagnosisText()`, `runCognitiveDiagnosis()`, `TCP_DIRECT_SCENARIO`, todas las referencias a `ObdSimulator`/`ObdSimulatorRepository`/`createMcpServer`/`ExecuteCognitiveDiagnosisUseCase`/`ProcessVehicleDiagnosisUseCase`
  - Mantener: `handleToolError()`, `handleCognitiveError()` (manejo de errores HTTP), esquemas Zod, constantes `ERROR_MESSAGES`
  - El controlador debe quedar en ~120 líneas (desde ~270)
- [x] 3.2 Actualizar `diagnosis.routes.ts`:
  - `createDiagnosisRoutes` recibe `DiagnosisController` en vez de `deps` sueltos
- [x] 3.3 Actualizar `server.ts`:
  - `createDiagnosisRoutes` recibe `controller` ya construido
- [x] 3.4 Actualizar `composition.ts`:
  - Crear `DiagnosisService` con `scenarios`, `obdRepo`, `llmClient`, `logger`
  - Crear `DiagnosisController` con el servicio
  - Pasar controller a `createDiagnosisRoutes`
- [x] 3.5 Suite completa verde + `pnpm lint`

## 4. Actualizar tests del controlador (REFACTOR)

- [x] 4.1 Actualizar `tests/unit/infrastructure/http/routes/diagnosis.routes.test.ts`:
  - Crear mock `DiagnosisService` en vez de mockear `ObdRepository` y `LlmClientPort` por separado
  - Adaptar assertions a los métodos mock del servicio
  - Verificar que los status codes y respuestas son idénticos a antes del refactor
  - Añadir test: `DiagnosisScenarioNotFoundError` → 404
  - Añadir test: `CognitiveDiagnosisUnavailableError` → 404
- [x] 4.2 Verificar que los tests de integración/unit de `DiagnosisService` cubren los mismos escenarios que antes cubría el controlador

## 5. Verificación final (Zero Broken Windows)

- [x] 5.1 `pnpm test` → todos los tests verdes (488)
- [x] 5.2 `pnpm lint && pnpm format` → sin errores
- [x] 5.3 `pnpm build` → compila sin errores
- [x] 5.4 Verificación estructural:
  - `grep -rn "new ProcessVehicleDiagnosisUseCase\|new ExecuteCognitiveDiagnosisUseCase" src/infrastructure/http/` → vacío (solo en `DiagnosisService`)
  - `grep -rn "console\." src/application/` → vacío
  - `grep -rn "ObdSimulator\|ObdSimulatorRepository" src/infrastructure/http/` → vacío
- [x] 5.5 Actualizar `AGENTS.md` (SESION ACTUAL: cambio `fix-clean-architecture-deviations` completado)
