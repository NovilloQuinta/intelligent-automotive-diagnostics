# Vehicle Identification

## Purpose

Identificar el vehículo conectado combinando el VIN leído de la centralita con los metadatos del escenario, distinguiendo explícitamente los casos en que el VIN no puede leerse, y dando una respuesta correcta tanto contra el emulador (con catálogo) como contra un ELM327 real (sin catálogo).

## ADDED Requirements

### Requirement: El VIN procede siempre de la centralita
El sistema SHALL obtener el VIN leyendo Mode 09 PID 02 del vehículo conectado, y NEVER sustituirlo por un valor del catálogo de escenarios.

#### Scenario: VIN leído y catálogo disponible
- **WHEN** se identifica un escenario del emulador cuyo ECU responde a `09 02`
- **THEN** el `vin` devuelto es el leído del ECU
- **AND** `manufacturer`, `region` y `modelYearDecoded` se decodifican de ese VIN

#### Scenario: VIN del ECU distinto del esperado por el catálogo
- **WHEN** el VIN leído no corresponde al vehículo descrito en el escenario
- **THEN** se devuelve el VIN leído sin corregirlo
- **AND** los metadatos del catálogo se devuelven igualmente, de modo que la discrepancia sea visible

---

### Requirement: Los metadatos del vehículo se completan con el catálogo cuando existe
El sistema SHALL completar `make`, `model`, `year` y `engineType` desde el `ScenarioDescriptor` cuando el `scenarioId` resuelve a un escenario conocido.

#### Scenario: Escenario del emulador
- **WHEN** se pide la identificación de `audi-a3-tdi`
- **THEN** `model` es `A3` y `engineType` es `2.0 TDI`, procedentes del catálogo
- **AND** ninguno de esos campos vale `unknown`

#### Scenario: Conexión TCP directa sin catálogo
- **WHEN** el sistema opera en modo TCP directo contra un vehículo real
- **THEN** `make` se deduce del WMI del VIN leído
- **AND** `model` y `engineType` valen `unknown`, que es la información que el protocolo OBD-II estándar expone

---

### Requirement: Estado de lectura del VIN diferenciado
El sistema SHALL distinguir entre VIN leído correctamente, ECU que no soporta la petición, y respuesta ilegible, mediante un campo `vinStatus`.

#### Scenario: Lectura correcta
- **WHEN** el ECU responde a `09 02` con un VIN válido
- **THEN** `vinStatus` es `read`

#### Scenario: ECU sin soporte para Mode 09
- **WHEN** el ECU responde `NO DATA` a `09 02`
- **THEN** `vinStatus` es `unsupported`
- **AND** los campos derivados del VIN valen `null`
- **AND** la identificación no falla: el resto del diagnóstico sigue disponible

#### Scenario: Respuesta ilegible
- **WHEN** el ECU responde algo que no parsea como VIN
- **THEN** `vinStatus` es `unreadable`
- **AND** el wizard lo comunica como problema de lectura, no como vehículo desconocido
