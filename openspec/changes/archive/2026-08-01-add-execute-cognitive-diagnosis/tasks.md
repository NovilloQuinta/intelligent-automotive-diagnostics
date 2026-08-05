## 1. RED — Tests use case executeCognitiveDiagnosis

^- [x] 1.1 Crear `tests/unit/usecases/cognitive/executeCognitiveDiagnosis.test.ts` con `vi.fn()` mocks:
  - **Llama a sendMessage con systemPrompt + userMessage + tools + handler**: mock `LlmClientPort`, mock `McpServerBridge` con 6 tools → verifica que `sendMessage` recibe las definiciones correctas
  - **Handler ejecuta callTool y extrae content[0].text**: invocar el handler pasado a sendMessage → verifica que llama a `mcpServer.callTool("read_pid", args)` y devuelve el texto
  - **Parsea bloque ---JSON---**: LLM devuelve narrativa + bloque válido → resultado con severity/confidence/recommendations correctos
  - **Respuesta sin bloque JSON → fallback**: texto plano sin delimitador → `Severity.Medium`, `confidence: 0.5`, `recommendations: []`, narrativa intacta
  - **Bloque JSON mal formado → fallback**: JSON inválido → defaults
  - **confidence fuera de rango → fallback**: `confidence: 2` → defaults
  - **Propaga MaxToolCallIterationsError**: sendMessage lanza → el use case relanza
  - **toolCalls propagados**: LLM devuelve 2 tool calls → el resultado los incluye

## 2. GREEN — Implementar executeCognitiveDiagnosis

- [x] 2.1 Crear `src/application/use-cases/executeCognitiveDiagnosis.ts`:
  - `interface McpToolDefinition` reutilizada del puerto (`application/ports/llmClient.port.ts`)
  - `COGNITIVE_DIAGNOSIS_SYSTEM_PROMPT` constante interna (rol experto, instrucciones tools, formato ---JSON---)
  - `parseCognitiveDiagnosis(text)`: regex extrae bloque → Zod valida → fallback defaults
  - `executeCognitiveDiagnosis({ llmClient, tools, handler, userQuery?, vehicleContext? })` (bridge construido en la ruta, decision del orquestador — design.md decision 2):
    - `mcpServer.listTools()` → `McpToolDefinition[]`
    - handler → `mcpServer.callTool(name, args)` → `content[0].text`
    - `sendMessage({ systemPrompt, userMessage, tools, handler })`
    - devuelve `CognitiveDiagnosisResult`

## 3. RED — listTools() en McpServer

- [x] 3.1 Añadir tests en `tests/unit/infrastructure/mcp/mcpServer.test.ts`:
  - `listTools()` devuelve 6 definiciones con nombre, descripción y schema
  - Cada definición corresponde a una tool registrada

## 4. GREEN — Implementar listTools()

- [x] 4.1 Modificar `src/infrastructure/mcp/mcpServer.ts`:
  - Registrar name/description/schema de cada tool junto al handler (refactor menor del registro)
  - `listTools(): McpToolDefinition[]` que devuelve las definiciones registradas

## 5. RED — Tests ruta cognitiva

- [x] 5.1 Añadir tests en `tests/unit/infrastructure/http/routes/diagnosis.routes.test.ts`:
  - **POST /api/mcp/cognitive-diagnosis 200**: mock LLM + repo → responde `CognitiveDiagnosisResult` completo
  - **scenarioId inexistente → 404**: `{ error: "Scenario not found" }`
  - **body inválido → 400**: sin scenarioId → Zod issues
  - **timeout LLM → 504**: handler tarda > timeout → `{ error: "Cognitive diagnosis timed out" }`
  - **error del LLM → 500**: sendMessage lanza → `{ error: "Internal server error" }`
  - **endpoint no montado sin llmClient**: server sin `llmClient` → 404 en la ruta

## 6. GREEN — Implementar endpoint

- [x] 6.1 Modificar `src/infrastructure/http/routes/diagnosis.routes.ts`:
  - `CognitiveDiagnosisBodySchema` Zod: `{ scenarioId: string.min(1).optional() (TCP), query: string.optional() }`
  - Handler: resolveRepository → createMcpServer → executeCognitiveDiagnosis → 200
  - Timeout `COGNITIVE_DIAGNOSIS_TIMEOUT_MS = 60_000` con `Promise.race`
  - Mapeo de errores: 400 body inválido, 404 scenario, 504 timeout, 500 resto (reutilizando `handleToolError` o patrón análogo)
- [x] 6.2 Modificar `src/infrastructure/http/server.ts`:
  - Añadir `llmClient?: LlmClientPort` a `ServerDependencies`
  - Pasar `llmClient` a `createDiagnosisRoutes` y montar endpoint solo si presente
- [x] 6.3 Modificar `src/main.ts`:
  - Si `LLM_PROVIDER === 'anthropic'` → `createAnthropicClient({ apiKey: ANTHROPIC_API_KEY, model: LLM_MODEL })`
  - Si `LLM_PROVIDER === 'openai'` → `createOpenAiClient({ apiKey: LLM_API_KEY, baseURL: LLM_BASE_URL, model: LLM_MODEL })`
  - Inyectar `llmClient` en `createServer`

## 7. REFACTOR + Verificación

- [x] 7.1 Ejecutar `pnpm lint && pnpm format && pnpm test && pnpm build` — todo verde
- [x] 7.2 Revisar DRY/KISS: sin duplicación de tool definitions, errores mapeados sin duplicar lógica
- [x] 7.3 Actualizar `SESION ACTUAL` en `AGENTS.md`
