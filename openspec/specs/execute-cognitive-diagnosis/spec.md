# Execute Cognitive Diagnosis

## Purpose

Diagnóstico cognitivo LLM via MCP: un agente de IA recibe contexto del vehículo, invoca tools MCP en tiempo real (lectura de PIDs, DTCs, freeze frame, VIN) y produce un diagnóstico narrativo estructurado con severidad, confianza y recomendaciones. El parseo del bloque `---JSON---` (contrato externo del LLM) vive en un módulo anti-corrupción separado del use case.

## Requirements

### Requirement: Use case ExecuteCognitiveDiagnosis
El sistema SHALL implementar el use case `executeCognitiveDiagnosis` en `application/use-cases/executeCognitiveDiagnosis.ts` que orqueste una sesión de tool calling contra el `LlmClientPort`, construyendo las definiciones de tools desde el MCP Server y un handler bridge in-process, y delegando el parseo del bloque JSON al módulo anti-corrupción `cognitiveDiagnosisParser.ts`. El use case NO contiene regex, schema Zod ni lógica de fallback propios.

#### Scenario: Diagnóstico exitoso con tools
- **GIVEN** un `LlmClientPort` mock que responde narrativa + bloque `---JSON---` válido
- **WHEN** se invoca `executeCognitiveDiagnosis({ llmClient, tools, handler, userQuery, vehicleContext })`
- **THEN** se llama a `sendMessage` con las tool definitions y el handler del MCP Server
- **AND** se delega en `parseCognitiveDiagnosis` para obtener `{ severity, confidence, recommendations }`
- **AND** se devuelve `CognitiveDiagnosisResult` con `toolCalls` de la sesión

#### Scenario: Narrativa sin bloque JSON
- **GIVEN** el LLM devuelve texto plano sin `---JSON---`
- **WHEN** se ejecuta el use case
- **THEN** se devuelve `CognitiveDiagnosisResult` con fallback `Severity.Medium`, `confidence: 0.5`, `recommendations: []`
- **AND** la narrativa se conserva íntegra

#### Scenario: Bloque JSON mal formado
- **GIVEN** el LLM devuelve un bloque JSON sintácticamente inválido
- **WHEN** se ejecuta el use case
- **THEN** se aplica el fallback de defaults sin lanzar error

#### Scenario: Error del LLM propagado
- **GIVEN** `sendMessage` lanza `MaxToolCallIterationsError`
- **WHEN** se invoca el use case
- **THEN** el error se propaga al llamador

---

### Requirement: Parser anti-corrupción del bloque JSON del LLM
El sistema SHALL extraer el parseo de la salida del LLM a un módulo anti-corrupción `application/services/cognitiveDiagnosisParser.ts` que exporte `parseCognitiveDiagnosis(text)`, `cognitiveDiagnosisJsonSchema` y el tipo `ParsedCognitiveDiagnosis`. La salida del LLM es un contrato externo; el parser la normaliza con fallback sin lanzar errores.

#### Scenario: Bloque JSON válido inline
- **GIVEN** una narrativa con bloque `---JSON---{...}---` válido inline
- **WHEN** se invoca `parseCognitiveDiagnosis(text)`
- **THEN** devuelve `{ severity, confidence, recommendations }` validado por el schema Zod

#### Scenario: Variante de bloque con saltos de línea
- **GIVEN** una narrativa con bloque `---JSON\n{...}\n---` (formato real de DeepSeek)
- **WHEN** se invoca `parseCognitiveDiagnosis(text)`
- **THEN** el bloque se extrae y valida correctamente

#### Scenario: Narrativa sin bloque JSON
- **GIVEN** texto plano sin delimitador `---JSON---`
- **WHEN** se invoca `parseCognitiveDiagnosis(text)`
- **THEN** devuelve fallback `Severity.Medium`, `confidence: 0.5` y `recommendations: []`

#### Scenario: Bloque JSON mal formado o fuera de rango
- **GIVEN** un bloque JSON sintácticamente inválido, `confidence` fuera de `[0, 1]` o `severity` inválido
- **WHEN** se invoca `parseCognitiveDiagnosis(text)`
- **THEN** se aplica el fallback de defaults sin lanzar error

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
El sistema SHALL exponer `POST /api/mcp/cognitive-diagnosis` que ejecute el diagnóstico cognitivo y devuelva el resultado, incluido el `sessionId` de la sesión de diagnóstico vinculada. El endpoint solo se monta si el server recibe `llmClient` en sus dependencias. El body SHALL aceptar un `sessionId` opcional para encadenar preguntas de seguimiento a una sesión existente.

#### Scenario: Diagnóstico cognitivo exitoso
- **GIVEN** un servidor con `llmClient` y un escenario válido (`audi-a3-idle`)
- **WHEN** se hace `POST /api/mcp/cognitive-diagnosis` con body `{ scenarioId: "audi-a3-idle", query: "¿Por qué tiembla el motor al ralentí?" }`
- **THEN** responde 200 con `{ diagnosis, severity, confidence, recommendations, toolCalls, sessionId }`
- **AND** `sessionId` identifica la sesión de diagnóstico creada

#### Scenario: Follow-up encadenado a una sesión existente
- **GIVEN** un diagnóstico previo que devolvió un `sessionId`
- **WHEN** se hace `POST /api/mcp/cognitive-diagnosis` con body `{ scenarioId, query: "¿Y si también falla en frío?", sessionId }`
- **THEN** responde 200 con el mismo `sessionId`
- **AND** no se crea una sesión de diagnóstico nueva

#### Scenario: sessionId de otro usuario o inexistente
- **GIVEN** un `sessionId` que no pertenece al usuario autenticado o no existe
- **WHEN** se hace `POST /api/mcp/cognitive-diagnosis` con ese `sessionId`
- **THEN** responde 404 con un error de sesión no encontrada
- **AND** no se crea ni se modifica ninguna sesión

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

---

### Requirement: El diagnóstico se persiste ligado a su sesión

El sistema SHALL persistir el diagnóstico cognitivo (narrativa, severidad, confianza, recomendaciones y conversación) en la columna `result_json` de la tabla `diagnosis_sessions`, reutilizando la sesión ya existente. El sistema SHALL NOT crear una tabla ni columna nuevas para almacenar el diagnóstico.

#### Scenario: Primer diagnóstico crea y persiste la sesión
- **GIVEN** un diagnóstico cognitivo sin `sessionId` previo
- **WHEN** el diagnóstico termina con éxito
- **THEN** se crea una `diagnosis_session` con `ended_at`, `severity` y `result_json` cumplimentados
- **AND** `result_json` contiene la narrativa, severidad, confianza y recomendaciones del diagnóstico

#### Scenario: Follow-up actualiza la sesión existente
- **GIVEN** una `diagnosis_session` existente con su `result_json`
- **WHEN** se completa un follow-up encadenado a esa sesión
- **THEN** la conversación (pregunta y respuesta) queda añadida al `result_json` de la misma sesión
- **AND** no se crea una sesión nueva para el follow-up

#### Scenario: Nueva diagnosis abre sesión nueva
- **GIVEN** una sesión previa ya cerrada
- **WHEN** se lanza un nuevo diagnóstico sin `sessionId`
- **THEN** se crea una `diagnosis_session` nueva
- **AND** la sesión previa se conserva intacta con su contenido
