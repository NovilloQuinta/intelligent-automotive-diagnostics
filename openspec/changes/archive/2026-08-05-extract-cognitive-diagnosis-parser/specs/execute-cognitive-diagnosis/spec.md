# Execute Cognitive Diagnosis

## Purpose

Diagnóstico cognitivo LLM via MCP: un agente de IA recibe contexto del vehículo, invoca tools MCP en tiempo real (lectura de PIDs, DTCs, freeze frame, VIN) y produce un diagnóstico narrativo estructurado con severidad, confianza y recomendaciones. El parseo del bloque `---JSON---` (contrato externo del LLM) vive en un módulo anti-corrupción separado del use case.

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Use case ExecuteCognitiveDiagnosis (MODIFIED)
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
