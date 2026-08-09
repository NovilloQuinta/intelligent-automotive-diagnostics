# Knowledge Confidence Validation

## Purpose

Dar a las tres entradas de conocimiento del catálogo auto-expansivo (PIDs, DTCs, diagnósticos) confianza y procedencia consistentes, y permitir validar contra el vehículo real conectado un PID o DTC descubierto, subiendo su confianza cuando se confirma.

## ADDED Requirements

### Requirement: Esquema de confianza unificado
El sistema SHALL exponer `confidence: number` y `source: KnowledgeSource` en `PidKnowledgeEntry`, `DtcKnowledgeEntry` y `DiagnosisKnowledgeEntry`, y `validated: boolean` en `PidKnowledgeEntry` y `DtcKnowledgeEntry`.

#### Scenario: Confianza inicial por procedencia
- **WHEN** se crea una entrada con `source: KnowledgeSource.Web`
- **THEN** su `confidence` inicial es 0.3
- **AND WHEN** `source: KnowledgeSource.Mechanic`
- **THEN** su `confidence` inicial es 0.8
- **AND WHEN** `source: KnowledgeSource.PreviousDiagnosis`
- **THEN** su `confidence` inicial es 0.5

#### Scenario: Diagnosis no tiene campo de validación OBD
- **WHEN** se inspecciona la forma de `DiagnosisKnowledgeEntry`
- **THEN** no expone ningún campo `validated`
- **AND** su confianza solo puede subir mediante reutilización exitosa (fuera de alcance de este cambio, solo la función de escalado queda disponible)

---

### Requirement: Validación OBD de un PID descubierto
El sistema SHALL proporcionar un caso de uso que, dado un `PidKnowledgeEntry` recién descubierto y un `ObdRepository` conectado, lee el PID real, evalúa la fórmula del PID (no una fórmula genérica) y comprueba si el valor cae en `[minValue, maxValue]`.

#### Scenario: Valor dentro de rango
- **WHEN** el vehículo conectado responde al PID descubierto y el valor evaluado con su fórmula cae dentro de `[minValue, maxValue]`
- **THEN** el resultado tiene `outcome: 'validated'`
- **AND** la entrada devuelta tiene `validated: true`
- **AND** `confidence` sube según la tabla de escalado del `source` original (`Web` → 0.7, `Mechanic` → 0.9)

#### Scenario: Valor fuera de rango
- **WHEN** el valor evaluado cae fuera de `[minValue, maxValue]`
- **THEN** el resultado tiene `outcome: 'out_of_range'`
- **AND** la entrada devuelta es idéntica a la de entrada (sin subir confianza ni marcar `validated`)

#### Scenario: Sin vehículo conectado
- **WHEN** `obdRepo` es `undefined`
- **THEN** el resultado tiene `outcome: 'no_vehicle'`
- **AND** no se lanza ninguna excepción
- **AND** la entrada devuelta es idéntica a la de entrada

#### Scenario: Adaptador sin soporte de lectura cruda (modo simulación)
- **WHEN** `obdRepo.readPidRaw(...)` lanza `PidRawReadNotSupportedError`
- **THEN** el resultado tiene `outcome: 'unsupported'`
- **AND** no se propaga la excepción
- **AND** la entrada devuelta es idéntica a la de entrada

#### Scenario: Fallo real del adaptador se propaga
- **WHEN** `obdRepo.readPidRaw(...)` rechaza con un error distinto de `PidRawReadNotSupportedError` (ej. fallo de conexión ELM327)
- **THEN** el caso de uso propaga la excepción — no es una condición degradable

---

### Requirement: Lectura cruda de un PID sin fórmula aplicada
`ObdRepository` SHALL exponer `readPidRaw(mode, pid, dataBytes)`, que devuelve los bytes de datos crudos de la respuesta OBD sin aplicar ninguna fórmula.

#### Scenario: Modo TCP real
- **WHEN** `Elm327TcpRepository.readPidRaw(mode, pid, dataBytes)` se invoca contra un adaptador ELM327 conectado
- **THEN** devuelve los `dataBytes` bytes de la respuesta, sin pasar por ningún catálogo de fórmulas interno

#### Scenario: Modo simulación con PID no modelado
- **WHEN** `ObdSimulatorRepository.readPidRaw(mode, pid, dataBytes)` se invoca con un PID que no es uno de los cuatro sensores fijos del escenario activo
- **THEN** lanza `PidRawReadNotSupportedError`

---

### Requirement: Validación OBD de un DTC descubierto
El sistema SHALL proporcionar un caso de uso que, dado un `DtcKnowledgeEntry` recién descubierto y un `ObdRepository` conectado, comprueba si el código aparece en una lectura real de DTCs (`readDtcCodes()`).

#### Scenario: Código presente
- **WHEN** el código del `DtcKnowledgeEntry` aparece en `readDtcCodes()`
- **THEN** el resultado tiene `outcome: 'validated'`
- **AND** la entrada devuelta tiene `validated: true` y `confidence` escalada según su `source`

#### Scenario: Código ausente
- **WHEN** el código no aparece en `readDtcCodes()`
- **THEN** el resultado tiene `outcome: 'not_found'`
- **AND** la entrada devuelta es idéntica a la de entrada

#### Scenario: Sin vehículo conectado
- **WHEN** `obdRepo` es `undefined`
- **THEN** el resultado tiene `outcome: 'no_vehicle'`
- **AND** no se lanza ninguna excepción
