# Diagnosis Session Report Screen

## Purpose

Informe consolidado de una sesión de diagnóstico: DTCs, freeze frame, ECUs, diagnóstico determinista y diagnóstico cognitivo LLM del vehículo activo en una sola vista, con degradación elegante cuando el LLM no está disponible o cuando datos de ECU/freeze frame aún no existen en el backend.

## Requirements

### Requirement: Endpoint GET /api/mcp/capabilities
El sistema SHALL exponer `GET /api/mcp/capabilities` que devuelva `{ cognitiveDiagnosis: boolean }` según si el servidor tiene un `llmClient` configurado, cerrando el hueco ya referenciado por `api.getCapabilities()` en el cliente frontend.

#### Scenario: LLM configurado
- **GIVEN** un servidor con `llmClient` en sus dependencias
- **WHEN** se hace `GET /api/mcp/capabilities`
- **THEN** responde 200 con `{ cognitiveDiagnosis: true }`

#### Scenario: LLM no configurado
- **GIVEN** un servidor sin `llmClient`
- **WHEN** se hace `GET /api/mcp/capabilities`
- **THEN** responde 200 con `{ cognitiveDiagnosis: false }`

---

### Requirement: Composición client-side del informe de sesión
El sistema SHALL implementar `useSessionReport(scenarioId)` que orqueste en paralelo el diagnóstico determinista, ECUs, freeze frame y diagnóstico cognitivo (si disponible), exponiendo cada sección con su propio estado de carga independiente.

#### Scenario: Informe completo con LLM disponible
- **GIVEN** `capabilities.cognitiveDiagnosis === true` y un escenario con DTCs y freeze frame
- **WHEN** se invoca `useSessionReport(scenarioId)`
- **THEN** se disparan en paralelo `POST /api/diagnosis`, `GET /api/ecu-info`, `GET /api/freeze-frame` y `POST /api/mcp/cognitive-diagnosis`
- **AND** los datos deterministas se muestran en cuanto responden, sin esperar al LLM

#### Scenario: LLM no disponible
- **GIVEN** `capabilities.cognitiveDiagnosis === false`
- **WHEN** se genera el informe
- **THEN** la sección cognitiva muestra un mensaje de no disponibilidad, sin bloquear el resto del informe

#### Scenario: Endpoints de ECU/freeze frame aún no implementados (404)
- **GIVEN** `GET /api/ecu-info` o `GET /api/freeze-frame` responden 404 (ruta no montada)
- **WHEN** se genera el informe
- **THEN** esas secciones se omiten silenciosamente (sin mensaje de error), y el resto del informe se muestra con normalidad

---

### Requirement: Panel de informe de sesión
El sistema SHALL mostrar un componente `SessionReportPanel` accesible desde el dashboard (botón "Generar informe") con secciones: cabecera del vehículo, DTCs + severidad determinista, freeze frame, ECUs, diagnóstico cognitivo (narrativa, severidad, confianza, recomendaciones, traza de tools).

#### Scenario: Generar informe desde el dashboard
- **GIVEN** un vehículo seleccionado en el dashboard
- **WHEN** el usuario pulsa "Generar informe"
- **THEN** se muestra `SessionReportPanel` con las secciones deterministas pobladas de inmediato

#### Scenario: Diagnóstico cognitivo en curso
- **GIVEN** el informe generado y `POST /api/mcp/cognitive-diagnosis` aún pendiente
- **WHEN** se renderiza la sección cognitiva
- **THEN** muestra un indicador de carga sin bloquear las demás secciones ya pobladas

#### Scenario: Traza de tools del diagnóstico cognitivo
- **GIVEN** un diagnóstico cognitivo completado con `toolCalls: [{ tool: 'read_pid', args: {...}, result: '...' }, ...]`
- **WHEN** se renderiza la sección cognitiva
- **THEN** la traza de tools se muestra en un elemento colapsable (no ocupa espacio por defecto)
