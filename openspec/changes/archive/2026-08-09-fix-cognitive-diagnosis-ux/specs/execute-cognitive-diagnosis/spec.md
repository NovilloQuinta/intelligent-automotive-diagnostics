# Execute Cognitive Diagnosis (delta)

## MODIFIED Requirements

### Requirement: Use case ExecuteCognitiveDiagnosis
El sistema SHALL implementar el use case `ExecuteCognitiveDiagnosisUseCase` que orqueste una sesión de tool calling contra el `LlmClientPort`, construyendo las definiciones de tools desde el MCP Server y un handler bridge in-process, y delegando el parseo del bloque JSON al módulo anti-corrupción de parseo. El system prompt SHALL instruir al LLM para que (a) indexe vía la tool `index_pid` cualquier PID leído cuyo significado no reconozca, y (b) responda de forma concisa, con pasos accionables, dirigida a un mecánico.

#### Scenario: Diagnóstico exitoso con tools
- **GIVEN** un `LlmClientPort` mock que responde narrativa + bloque `---JSON---` válido
- **WHEN** se invoca el use case con `{ llmClient, tools, handler, userQuery, vehicleContext }`
- **THEN** se llama a `sendMessage` con las tool definitions y el handler del MCP Server
- **AND** se delega en el parser anti-corrupción para obtener `{ severity, confidence, recommendations }`
- **AND** se devuelve el resultado con `toolCalls` de la sesión

#### Scenario: El system prompt instruye indexar PIDs desconocidos
- **GIVEN** cualquier invocación del use case
- **WHEN** se inspecciona el `systemPrompt` enviado a `sendMessage`
- **THEN** contiene una instrucción explícita de usar `index_pid` cuando se lea un PID cuyo significado no se reconozca

#### Scenario: El system prompt pide concisión orientada a mecánico
- **GIVEN** cualquier invocación del use case
- **WHEN** se inspecciona el `systemPrompt` enviado a `sendMessage`
- **THEN** contiene una instrucción explícita de responder de forma concisa, con pasos o bullets accionables, dirigida a un mecánico

#### Scenario: Narrativa sin bloque JSON
- **GIVEN** el LLM devuelve texto plano sin `---JSON---`
- **WHEN** se ejecuta el use case
- **THEN** se devuelve el resultado con fallback `Severity.Medium`, `confidence: 0.5`, `recommendations: []`
- **AND** la narrativa se conserva íntegra

#### Scenario: Bloque JSON mal formado
- **GIVEN** el LLM devuelve un bloque JSON sintácticamente inválido
- **WHEN** se ejecuta el use case
- **THEN** se aplica el fallback de defaults sin lanzar error

#### Scenario: Error del LLM propagado
- **GIVEN** `sendMessage` lanza `MaxToolCallIterationsError`
- **WHEN** se invoca el use case
- **THEN** el error se propaga al llamador sin capturarse

---

### Requirement: Endpoint POST /api/mcp/cognitive-diagnosis
El sistema SHALL exponer `POST /api/mcp/cognitive-diagnosis` que ejecute el diagnóstico cognitivo y devuelva el resultado. El endpoint solo se monta si el server recibe `llmClient` en sus dependencias. Los errores conocidos del ciclo de tool calling SHALL mapearse a un status HTTP específico con mensaje accionable, distinto del 500 genérico.

#### Scenario: Diagnóstico cognitivo exitoso
- **GIVEN** un servidor con `llmClient` y un escenario válido
- **WHEN** se hace `POST /api/mcp/cognitive-diagnosis` con body `{ scenarioId, query }`
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

#### Scenario: Se agotan las iteraciones de tool calling
- **GIVEN** el ciclo de tool calling agota sus 10 iteraciones sin devolver texto final (`MaxToolCallIterationsError`)
- **WHEN** se hace `POST /api/mcp/cognitive-diagnosis`
- **THEN** responde con un status 4xx específico (no 500 ni 503)
- **AND** el body incluye un mensaje accionable indicando que el diagnóstico necesitó demasiados pasos y que se pruebe con una pregunta más concreta

#### Scenario: Error inesperado del LLM
- **GIVEN** `sendMessage` lanza un error inesperado no contemplado (ni timeout, ni scenario, ni máximo de iteraciones)
- **WHEN** se hace `POST /api/mcp/cognitive-diagnosis`
- **THEN** responde 500 con `{ error: "Internal server error" }` sin filtrar detalles internos (OWASP A09)

#### Scenario: Endpoint no montado sin llmClient
- **GIVEN** un servidor sin `llmClient` en sus dependencias
- **WHEN** se hace `POST /api/mcp/cognitive-diagnosis`
- **THEN** responde 404 (ruta no registrada)
