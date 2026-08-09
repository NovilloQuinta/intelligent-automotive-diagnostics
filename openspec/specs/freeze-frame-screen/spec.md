# Freeze Frame Screen

## Purpose

Pantalla de datos "freeze frame" (valores de sensores congelados en el momento en que se disparó un DTC), accesible seleccionando un código en el panel de DTCs existente. Reutiliza el VO `FreezeFrame` y `ObdRepository.getFreezeFrame(dtc?)` ya implementados, exponiéndolos como endpoint estructurado.

## Requirements

### Requirement: ObdSimulator filtra freeze frame por DTC
El sistema SHALL hacer que `ObdSimulator.getFreezeFrame(dtc?)` devuelva `null` cuando se especifica un `dtc` que no coincide con el `dtcCode` del freeze frame del escenario activo.

#### Scenario: dtc coincide
- **GIVEN** un escenario con `freezeFrame: { dtcCode: 'P0301', pidValues: {...} }`
- **WHEN** se invoca `getFreezeFrame('P0301')`
- **THEN** devuelve el `FreezeFrame` completo

#### Scenario: dtc no coincide
- **GIVEN** el mismo escenario
- **WHEN** se invoca `getFreezeFrame('P0420')`
- **THEN** devuelve `null`

#### Scenario: sin dtc especificado
- **GIVEN** el mismo escenario
- **WHEN** se invoca `getFreezeFrame()` (sin argumento)
- **THEN** devuelve el `FreezeFrame` del escenario (comportamiento actual, sin cambios)

---

### Requirement: Endpoint GET /api/freeze-frame
El sistema SHALL exponer `GET /api/freeze-frame?scenarioId=&dtc=` que devuelva `{ freezeFrame: FreezeFrame | null }`, resolviendo el repositorio con el mismo patrón que `/api/diagnosis` y `/api/ecu-info`.

#### Scenario: Freeze frame existente para el DTC
- **GIVEN** el escenario `audi-a3-idle` con DTC `P0301` y freeze frame asociado
- **WHEN** se hace `GET /api/freeze-frame?scenarioId=audi-a3-idle&dtc=P0301`
- **THEN** responde 200 con `{ freezeFrame: { dtcCode: 'P0301', pidValues: {...} } }`

#### Scenario: DTC sin freeze frame asociado
- **GIVEN** el mismo escenario
- **WHEN** se hace `GET /api/freeze-frame?scenarioId=audi-a3-idle&dtc=P0420`
- **THEN** responde 200 con `{ freezeFrame: null }`

#### Scenario: Escenario inexistente
- **WHEN** se hace `GET /api/freeze-frame?scenarioId=no-existe`
- **THEN** responde 404 con `{ error: "Scenario not found" }`

#### Scenario: dtc opcional
- **WHEN** se hace `GET /api/freeze-frame?scenarioId=audi-a3-idle` sin parámetro `dtc`
- **THEN** responde 200 con el freeze frame del escenario (sin filtrar)

---

### Requirement: Selección de DTC en el dashboard
El sistema SHALL permitir seleccionar un código DTC en `DtcPanel` y mostrar su freeze frame asociado en un nuevo componente `FreezeFramePanel`.

#### Scenario: Selección de DTC dispara la consulta
- **GIVEN** un diagnóstico con al menos un DTC listado en `DtcPanel`
- **WHEN** el usuario hace click en una fila de DTC
- **THEN** `FreezeFramePanel` invoca `GET /api/freeze-frame?scenarioId=<id>&dtc=<código>` y muestra los valores de PID congelados

#### Scenario: Sin selección
- **GIVEN** ningún DTC seleccionado
- **WHEN** se renderiza `FreezeFramePanel`
- **THEN** muestra un estado vacío invitando a seleccionar un código

#### Scenario: DTC sin datos congelados
- **GIVEN** un DTC seleccionado cuya respuesta es `{ freezeFrame: null }`
- **WHEN** se renderiza `FreezeFramePanel`
- **THEN** muestra un mensaje "sin freeze frame para este código"
