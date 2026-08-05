# Elm327 TCP Repository

## Purpose

Adaptador OBD-II sobre TCP que implementa `ObdRepositoryPort` para comunicarse con el emulador ELM327 Docker. Los imports de `Elm327TcpRepository` se actualizan para reflejar la nueva ubicación de `PidFormulaCatalog` (puerto en `application/ports/`), `createPidFormulaCatalog` (factory en `infrastructure/elm327/pidFormulaCatalog.ts`), y `pidDefinitionsToFormulaEntries` (mapping en `application/shared/`).

## MODIFIED Requirements

### Requirement: Inyección de catálogo de fórmulas desde nuevas ubicaciones (MODIFIED)
El sistema SHALL modificar `Elm327TcpRepository` en `infrastructure/elm327/elm327Adapter.ts` para importar `createPidFormulaCatalog` desde `./pidFormulaCatalog.js`, `PidFormulaCatalog` type desde `@/application/ports/PidFormulaCatalog.js`, y `pidDefinitionsToFormulaEntries` desde `@/application/shared/pidDefinitionsToFormulaEntries.js`. El catálogo se construye en el constructor con `createPidFormulaCatalog(pidDefinitionsToFormulaEntries(ALL_SEED_PIDS))` sin cambios de comportamiento.

#### Scenario: Import de createPidFormulaCatalog desde pidFormulaCatalog.ts
- **GIVEN** `elm327Adapter.ts` tras el refactor
- **WHEN** se inspeccionan sus imports
- **THEN** `createPidFormulaCatalog` se importa desde `./pidFormulaCatalog.js` (no desde `./pidFormulas.js`)
- **AND** `PidFormulaCatalog` type se importa desde `@/application/ports/PidFormulaCatalog.js`
- **AND** `pidDefinitionsToFormulaEntries` se importa desde `@/application/shared/pidDefinitionsToFormulaEntries.js`

#### Scenario: Constructor sin cambios de comportamiento
- **GIVEN** `Elm327TcpRepository` construido con `Elm327TcpConfig`
- **WHEN** se inspecciona el constructor
- **THEN** `this.pidFormulas = createPidFormulaCatalog(pidDefinitionsToFormulaEntries(ALL_SEED_PIDS))`
- **AND** el catálogo resultante tiene el mismo comportamiento que antes del refactor

#### Scenario: readPid Mode 01 RPM sin cambios
- **GIVEN** `Elm327TcpRepository` construido con las nuevas ubicaciones de imports
- **WHEN** se invoca `repo.readPid("01", "0C")` con respuesta mock `"41 0C 0C 80"`
- **THEN** devuelve `800` (misma fórmula `(A*256+B)/4`, mismo comportamiento)

#### Scenario: readPid Mode 22 VAG sin cambios
- **GIVEN** `Elm327TcpRepository` construido con nuevas ubicaciones
- **WHEN** se invoca `repo.readPid("22", "1130")` con respuesta mock `"62 11 30 0C 80"`
- **THEN** devuelve `800` (fórmula desde `VAG_AUDI_MODE_22_PIDS` en seed, mismo comportamiento)

#### Scenario: Los 8 métodos públicos conservan firma
- **GIVEN** `Elm327TcpRepository` con imports actualizados
- **WHEN** se inspeccionan sus métodos públicos
- **THEN** `readPid`, `getSupportedPids`, `getFreezeFrame`, `readDtcCodes`, `clearDtcCodes`, `readVin`, `getVehicleInfo`, `setPower` conservan firma y comportamiento idénticos
