## Why

La Fase 4 (Diagnóstico Cognitivo LLM via MCP) está incompleta: existe toda la infraestructura — `LlmClientPort` con `sendMessage()` y tool calling loop (`AnthropicClient`, `OpenAiClient`), MCP Server con 6 tools OBD (`read_pid`, `get_dtc_codes`, `get_freeze_frame`, `read_vin`, `get_vehicle_info`, `get_available_pids`), y el tipo `CognitiveDiagnosisResult` — pero no hay ningún caso de uso que los conecte. El endpoint `POST /api/mcp/cognitive-diagnosis` está documentado en el README como disponible, pero no existe en el servidor: la ruta `diagnosis.routes.ts` solo expone `/diagnosis`, `/scenarios` y `/mcp/tools/:toolName`.

El ADR 003 define el flujo: el LLM recibe contexto del vehículo, decide qué tools MCP invocar (razonamiento autónomo), y sintetiza un diagnóstico narrativo con severidad, confianza y recomendaciones. Sin `ExecuteCognitiveDiagnosis`, el "cerebro" del TFM no existe — el LLM solo puede usarse como chat sin acceso a los datos reales del simulador.

## What Changes

- **Nuevo use case `executeCognitiveDiagnosis`** (`application/use-cases/executeCognitiveDiagnosis.ts`): orquesta la sesión de tool calling — construye las definiciones de las 6 tools MCP, crea el `ToolCallHandler` bridge hacia `DiagnosticsMcpServer.callTool()`, invoca `llmClient.sendMessage()`, y parsea el resultado estructurado en `CognitiveDiagnosisResult`.
- **Nuevo endpoint `POST /api/mcp/cognitive-diagnosis`** en `diagnosis.routes.ts`: acepta `{ scenarioId, query? }`, resuelve el repositorio OBD (simulador o TCP), ejecuta el use case con timeout de 60s, responde 200 con `CognitiveDiagnosisResult`.
- **Extensión de `ServerDependencies`**: `llmClient?: LlmClientPort` opcional en `server.ts`, monta el endpoint solo si está presente.
- **Instanciación del LLM client en `main.ts`**: según `LLM_PROVIDER` (anthropic → `createAnthropicClient`, openai → `createOpenAiClient`), usando las env vars ya documentadas (`LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, `ANTHROPIC_API_KEY`).

## Capabilities

### New Capabilities
- `execute-cognitive-diagnosis`: Diagnóstico cognitivo LLM via MCP. El LLM explora datos OBD-II en tiempo real (tools MCP), razona causas raíz y produce un diagnóstico narrativo estructurado (severidad, confianza, recomendaciones) con traza de tools ejecutadas.

## Impact

- Nuevo: `apps/core-api/src/application/use-cases/executeCognitiveDiagnosis.ts`
- Nuevo: `apps/core-api/tests/unit/usecases/cognitive/executeCognitiveDiagnosis.test.ts`
- Modificado: `apps/core-api/src/infrastructure/http/routes/diagnosis.routes.ts` (+endpoint cognitivo)
- Modificado: `apps/core-api/tests/unit/infrastructure/http/routes/diagnosis.routes.test.ts`
- Modificado: `apps/core-api/src/infrastructure/http/server.ts` (+llmClient dep)
- Modificado: `apps/core-api/tests/unit/infrastructure/http/server.test.ts`
- Modificado: `apps/core-api/src/main.ts` (instanciar LLM client)
