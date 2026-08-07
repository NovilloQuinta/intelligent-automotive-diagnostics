# Execute Cognitive Diagnosis

## Purpose

Diagnóstico cognitivo LLM via MCP: un agente de IA recibe contexto del vehículo, invoca tools MCP en tiempo real (lectura de PIDs, DTCs, freeze frame, VIN) y produce un diagnóstico narrativo estructurado con severidad, confianza y recomendaciones.

## Requirements

### Requirement: Use case ExecuteCognitiveDiagnosis
El sistema SHALL implementar el use case `executeCognitiveDiagnosis` en `application/use-cases/executeCognitiveDiagnosis.ts` que orqueste una sesión de tool calling contra el `LlmClientPort`, construyendo las definiciones de tools desde el MCP Server y un handler bridge in-process.

#### Scenario: Diagnóstico exitoso con tools
- **GIVEN** un `LlmClientPort` mock que responde narrativa + bloque `---JSON---` válido
- **WHEN** se invoca `executeCognitiveDiagnosis({ llmClient, mcpServer, userQuery, vehicleContext })`
- **THEN** se llama a `sendMessage` con las 6 tool definitions del MCP Server
- **AND** el handler ejecuta `callTool` y devuelve el texto del primer content block
- **AND** se parsea el bloque JSON a `{ severity, confidence, recommendations }`
- **AND** se devuelve `CognitiveDiagnosisResult` con `toolCalls` de la sesión

#### Scenario: Narrativa sin bloque JSON
- **GIVEN** el LLM devuelve texto plano sin `---JSON---`
- **WHEN** se parsea la respuesta
- **THEN** se devuelve `CognitiveDiagnosisResult` con fallback `Severity.Medium`, `confidence: 0.5`, `recommendations: []`
- **AND** la narrativa se conserva íntegra

#### Scenario: Bloque JSON mal formado
- **GIVEN** el LLM devuelve un bloque JSON sintácticamente inválido
- **WHEN** se parsea la respuesta
- **THEN** se aplica el fallback de defaults sin lanzar error

#### Scenario: Error del LLM propagado
- **GIVEN** `sendMessage` lanza `MaxToolCallIterationsError`
- **WHEN** se invoca el use case
- **THEN** el error se propaga al llamador

---

### Requirement: MCP Server expone listTools
El sistema SHALL exponer `listTools(): McpToolDefinition[]` desde `DiagnosticsMcpServer` para que el use case obtenga las definiciones de las tools registradas sin duplicarlas.

#### Scenario: Lista de las 6 tools
- **GIVEN** un `createMcpServer(repo)` con repositorio OBD
- **WHEN** se invoca `listTools()`
- **THEN** devuelve 6 definiciones con `name`, `description` y `schema`
- **AND** cada nombre corresponde a una tool registrada (`read_pid`, `get_dtc_codes`, `get_freeze_frame`, `read_vin`, `get_vehicle_info`, `get_available_pids`)

---

### Requirement: Endpoint POST /api/mcp/cognitive-diagnosis
El sistema SHALL exponer `POST /api/mcp/cognitive-diagnosis` que ejecute el diagnóstico cognitivo y devuelva `CognitiveDiagnosisResult`. El endpoint solo se monta si el server recibe `llmClient` en sus dependencias.

#### Scenario: Diagnóstico cognitivo exitoso
- **GIVEN** un servidor con `llmClient` y un escenario válido (`audi-a3-idle`)
- **WHEN** se hace `POST /api/mcp/cognitive-diagnosis` con body `{ scenarioId: "audi-a3-idle", query: "¿Por qué tiembla el motor al ralentí?" }`
- **THEN** responde 200 con `{ diagnosis, severity, confidence, recommendations, toolCalls }`

#### Scenario: Scenario inexistente
- **GIVEN** un servidor con `llmClient`
- **WHEN** se hace `POST /api/mcp/cognitive-diagnosis` con `{ scenarioId: "no-existe" }`
- **THEN** responde 404 con `{ error: "Scenario not found" }`

#### Scenario: Body inválido
- **GIVEN** un servidor con `llmClient`
- **WHEN** se hace `POST /api/mcp/cognitive-diagnosis` con body vacío
- **THEN** responde 400 con detalles Zod

#### Scenario: Timeout del LLM
- **GIVEN** el LLM no responde dentro del timeout configurado (60s)
- **WHEN** se hace `POST /api/mcp/cognitive-diagnosis`
- **THEN** responde 504 con `{ error: "Cognitive diagnosis timed out" }`

#### Scenario: Error del LLM
- **GIVEN** `sendMessage` lanza un error inesperado
- **WHEN** se hace `POST /api/mcp/cognitive-diagnosis`
- **THEN** responde 500 con `{ error: "Internal server error" }` sin filtrar detalles internos (OWASP A09)

#### Scenario: Endpoint no montado sin llmClient
- **GIVEN** un servidor sin `llmClient` en sus dependencias
- **WHEN** se hace `POST /api/mcp/cognitive-diagnosis`
- **THEN** responde 404 (ruta no registrada)
