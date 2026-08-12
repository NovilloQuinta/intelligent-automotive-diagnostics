## MODIFIED Requirements

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

## ADDED Requirements

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
