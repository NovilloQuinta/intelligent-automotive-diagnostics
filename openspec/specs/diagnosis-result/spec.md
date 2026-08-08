# Diagnosis Result

## Purpose

Entidad rica del diagnóstico determinista: value object de dominio con invariantes (la severidad se deriva de los DTCs y el freeze frame, nunca se inyecta) y cero datos de presentación. La serialización para HTTP (`rawData`, `diagnosisText`) es responsabilidad de un mapper en infraestructura que mantiene intacto el contrato de `POST /api/diagnosis`.

## Requirements

### Requirement: Entidad rica DiagnosisResult
El sistema SHALL modelar `DiagnosisResult` en `domain/diagnosisResult.ts` como value object rico siguiendo el patrón `Vin`/`PidCode`: constructor privado, `static create()` que deriva la severidad, getters derivados y ausencia total de datos de presentación.

#### Scenario: Severidad derivada, no inyectable
- **GIVEN** `parsedValues: LiveData`, `dtcCodes: DtcCode[]` y `freezeFrame: FreezeFrame | null`
- **WHEN** se invoca `DiagnosisResult.create({ parsedValues, dtcCodes, freezeFrame })`
- **THEN** la severidad se calcula con `computeSeverity(dtcCodes.length, freezeFrame)`
- **AND** `create` NO acepta `severity`, `rawData` ni `diagnosisText` como parámetros del caller

#### Scenario: computeSeverity como regla pura
- **GIVEN** un recuento de DTCs y un freeze frame opcional
- **WHEN** se invoca `DiagnosisResult.computeSeverity(dtcCount, freezeFrame)`
- **THEN** devuelve `Severity.Low` si `dtcCount === 0`, `Severity.Critical` si hay freeze frame con DTCs, y `Severity.High` en el resto

#### Scenario: Getters derivados
- **GIVEN** un `DiagnosisResult` creado con 3 DTCs y freeze frame
- **WHEN** se consultan los getters
- **THEN** `dtcCount` es 3, `hasFreezeFrame` es `true` y `severity` es `Severity.Critical`

#### Scenario: Sin datos de presentación
- **GIVEN** cualquier `DiagnosisResult` creado
- **THEN** NO expone `rawData` ni `diagnosisText`

### Requirement: Use case processVehicleDiagnosis devuelve entidad pura
El sistema SHALL hacer que `processVehicleDiagnosis` en `application/use-cases/processVehicleDiagnosis.ts` devuelva la entidad rica sin producir datos de presentación: lee PIDs, DTCs y freeze frame, construye `parsedValues`, y delega el cálculo de severidad en `DiagnosisResult.create()`.

#### Scenario: Sin texto ni serialización en application
- **GIVEN** un `ObdRepositoryPort` mock con datos de sensores, DTCs y freeze frame
- **WHEN** se invoca `processVehicleDiagnosis(repo)`
- **THEN** devuelve un `DiagnosisResult` con `parsedValues`, `dtcCodes` y `severity` derivada
- **AND** el resultado no contiene `diagnosisText` ni `rawData`

### Requirement: Mapper HTTP de respuesta
El sistema SHALL serializar `DiagnosisResult` a la respuesta HTTP en infraestructura mediante el mapper `infrastructure/http/diagnosisResultMapper.ts`, que produce `rawData` (JSON.stringify de `parsedValues`) y `diagnosisText` (texto legible con severidad, DTCs y freeze frame), manteniendo el contrato previo de `POST /api/diagnosis`.

#### Scenario: Contrato HTTP sin cambios
- **GIVEN** un `DiagnosisResult` de ejemplo con DTCs y sin freeze frame
- **WHEN** el mapper `toDiagnosisResponse(result)` serializa la respuesta
- **THEN** el body es `{ rawData, parsedValues, dtcCodes, diagnosisText, severity }`
- **AND** `rawData` es `JSON.stringify(parsedValues)` y `diagnosisText` contiene la severidad y los códigos DTC

#### Scenario: diagnosisText incluye freeze frame
- **GIVEN** un `DiagnosisResult` con freeze frame
- **WHEN** el mapper serializa la respuesta
- **THEN** `diagnosisText` incluye el DTC del freeze frame y las claves de `pidValues`

#### Scenario: diagnosisText sin DTCs
- **GIVEN** un `DiagnosisResult` sin DTCs
- **WHEN** el mapper serializa la respuesta
- **THEN** `diagnosisText` es el texto de severidad Low sin códigos de fallo
