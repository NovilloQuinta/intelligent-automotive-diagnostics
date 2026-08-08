# Execute Cognitive Diagnosis

## Purpose

Diagnóstico cognitivo LLM via MCP: un agente de IA recibe contexto del vehículo, invoca tools MCP en tiempo real (lectura de PIDs, DTCs, freeze frame, VIN) y produce un diagnóstico narrativo estructurado con severidad, confianza y recomendaciones. Además de la traza genérica `toolCalls`, la salida incluye `pidObservations`: las lecturas `read_pid` de la sesión enriquecidas con metadata del catálogo `PidObservationCatalog` (nombre, unidad, veredicto ok/review).

## MODIFIED Requirements

### Requirement: Use case ExecuteCognitiveDiagnosis (MODIFIED)
El sistema SHALL implementar el use case `executeCognitiveDiagnosis` en `application/use-cases/ExecuteCognitiveDiagnosisUseCase.ts` que orqueste una sesión de tool calling contra el `LlmClientPort`, construyendo las definiciones de tools desde el MCP Server y un handler bridge in-process, delegando el parseo del bloque JSON en el módulo anti-corrupción existente, y derivando `pidObservations` a partir de los `toolCalls` de la sesión mediante `application/services/pidObservationEnricher.ts::derivePidObservations`. El use case NO contiene lógica de catálogo de PIDs propia — delega en el enricher, que a su vez delega en `domain/pidObservationCatalog.ts`.

#### Scenario: Diagnóstico exitoso con tools y PIDs observados
- **GIVEN** un `LlmClientPort` mock que responde narrativa + bloque `---JSON---` válido, con `toolCalls` que incluyen una llamada `read_pid` a un código presente en el catálogo
- **WHEN** se invoca `executeCognitiveDiagnosis({ llmClient, tools, handler, userQuery, vehicleContext })`
- **THEN** se devuelve `ExecuteCognitiveDiagnosisOutput` con `toolCalls` de la sesión (sin cambios respecto al comportamiento previo)
- **AND** `pidObservations` incluye una entrada con `code`, `name`, `unit?`, `value` y `status` derivados de esa llamada `read_pid`

#### Scenario: Sesión sin llamadas `read_pid`
- **GIVEN** una sesión cuyos `toolCalls` no incluyen ninguna llamada a `read_pid` (p. ej. solo `get_dtc_codes`)
- **WHEN** se invoca el use case
- **THEN** `pidObservations` es `[]`
- **AND** el resto de la salida (`diagnosis`, `severity`, `confidence`, `recommendations`, `toolCalls`) no se ve afectado

#### Scenario: Narrativa sin bloque JSON
- **GIVEN** el LLM devuelve texto plano sin `---JSON---`
- **WHEN** se ejecuta el use case
- **THEN** se devuelve `ExecuteCognitiveDiagnosisOutput` con fallback `Severity.Medium`, `confidence: 0.5`, `recommendations: []`
- **AND** `pidObservations` se calcula igualmente a partir de `toolCalls`, con independencia del resultado del parseo narrativo

#### Scenario: Error del LLM propagado
- **GIVEN** `sendMessage` lanza `MaxToolCallIterationsError`
- **WHEN** se invoca el use case
- **THEN** el error se propaga al llamador sin intentar derivar `pidObservations`
