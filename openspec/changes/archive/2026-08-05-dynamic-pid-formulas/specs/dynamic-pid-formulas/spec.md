# Dynamic PID Formulas

## Purpose

Catálogo de fórmulas PID sin hardcodeo — `createPidFormulaCatalog(entries)` acepta un `Iterable` externo de entradas, `pidDefinitionsToFormulaEntries()` convierte definiciones de PID al formato del catálogo, y las fórmulas VAG Mode 22 se migran a `seed-pids.ts` como fuente de verdad unificada.

## Requirements

### Requirement: Catálogo de fórmulas sin hardcodeo
El sistema SHALL proporcionar `createPidFormulaCatalog(entries)` que acepte un `Iterable<readonly [string, PidFormulaEntry]>` y devuelva un `PidFormulaCatalog` con `get(mode, pid)` y `apply(mode, pid, bytes)`.

#### Scenario: Construcción desde entries externas
- **GIVEN** entries `[["01 0C", { formula: "(A*256+B)/4", dataBytes: 2 }], ["22 1130", { formula: "(A*256+B)/4", dataBytes: 2 }]]`
- **WHEN** se invoca `createPidFormulaCatalog(entries)`
- **THEN** `catalog.get("01", "0C")` devuelve `{ formula: "(A*256+B)/4", dataBytes: 2 }`
- **AND** `catalog.get("22", "1130")` devuelve `{ formula: "(A*256+B)/4", dataBytes: 2 }`

#### Scenario: Catálogo vacío sin entries
- **GIVEN** entries `[]` (vacío)
- **WHEN** se invoca `createPidFormulaCatalog([])`
- **THEN** `catalog.get("01", "0C")` devuelve `undefined`
- **AND** `catalog.apply("01", "0C", [0x0C, 0x80])` devuelve `3200` (fallback big-endian)

#### Scenario: Aplicación de fórmula desde entries externas
- **GIVEN** catálogo construido con entries incluyendo `["01 0C", { formula: "(A*256+B)/4", dataBytes: 2 }]`
- **WHEN** se invoca `catalog.apply("01", "0C", [0x0C, 0x80])`
- **THEN** devuelve `800`

### Requirement: Conversión de PidDefinition a entries de catálogo
El sistema SHALL proporcionar `pidDefinitionsToFormulaEntries(definitions)` que convierta un array de objetos con `{ pidCode: { key }, formula, dataBytes }` a un array de entries `[string, PidFormulaEntry]`.

#### Scenario: Conversión de PIDs Mode 01 SAE
- **GIVEN** un array con un PID `{ pidCode: { key: "01 0C" }, formula: "(A*256+B)/4", dataBytes: 2 }`
- **WHEN** se invoca `pidDefinitionsToFormulaEntries(definitions)`
- **THEN** devuelve `[["01 0C", { formula: "(A*256+B)/4", dataBytes: 2 }]]`

#### Scenario: Filtrado de fórmulas vacías
- **GIVEN** un array con un PID `{ pidCode: { key: "09 02" }, formula: "", dataBytes: 17 }` (VIN, pidType ascii)
- **WHEN** se invoca `pidDefinitionsToFormulaEntries(definitions)`
- **THEN** la entrada se excluye del resultado (no se incluye en el array devuelto)

#### Scenario: Conversión del catálogo completo ALL_SEED_PIDS
- **GIVEN** `ALL_SEED_PIDS` (16 Mode 01 + 1 Mode 09 VIN + 4 Toyota Mode 22 + 16 VAG Mode 22 = 37 total)
- **WHEN** se invoca `pidDefinitionsToFormulaEntries(ALL_SEED_PIDS)`
- **THEN** devuelve 36 entries (37 - 1 VIN con fórmula vacía)

---

### Requirement: VAG Mode 22 DIDs en seed-pids.ts
El sistema SHALL definir `VAG_AUDI_MODE_22_PIDS: PidDefinition[]` en `seed-pids.ts` con los 16 DIDs de VW/Audi del catálogo Mode 22, usando el mismo formato que `TOYOTA_AURIS_MODE_22_PIDS`.

#### Scenario: DID 1130 Engine Speed
- **GIVEN** `VAG_AUDI_MODE_22_PIDS` está definido
- **WHEN** se busca el PID con `pidCode.key === "22 1130"`
- **THEN** tiene `name: "Engine Speed (VAG)"`, `formula: "(A*256+B)/4"`, `dataBytes: 2`, `unit: "rpm"`

#### Scenario: DID F430 Coolant Temperature
- **GIVEN** `VAG_AUDI_MODE_22_PIDS` está definido
- **WHEN** se busca el PID con `pidCode.key === "22 F430"`
- **THEN** tiene `name: "Coolant Temperature (VAG)"`, `formula: "A"`, `dataBytes: 1`, `unit: "°C"`

#### Scenario: Integración en ALL_SEED_PIDS
- **GIVEN** `ALL_SEED_PIDS` incluye `...VAG_AUDI_MODE_22_PIDS`
- **WHEN** se cuenta el total de PIDs
- **THEN** `ALL_SEED_PIDS.length === 37` (16 SAE + 1 VIN + 4 Toyota + 16 VAG)

---

### Requirement: Adapter ELM327 usa seed data unificada
El sistema SHALL modificar `Elm327TcpRepository` para construir el catálogo de fórmulas desde `ALL_SEED_PIDS` vía `pidDefinitionsToFormulaEntries()` en lugar de depender de constantes hardcodeadas en `pidFormulas.ts`.

#### Scenario: readPid Mode 01 RPM desde seed data
- **GIVEN** `Elm327TcpRepository` construido con `createPidFormulaCatalog(pidDefinitionsToFormulaEntries(ALL_SEED_PIDS))`
- **WHEN** se invoca `repo.readPid("01", "0C")` con respuesta mock `"41 0C 0C 80"`
- **THEN** devuelve `800` (fórmula `(A*256+B)/4` desde seed, no hardcode)

#### Scenario: readPid Mode 22 VAG desde seed data
- **GIVEN** `Elm327TcpRepository` construido con seed data que incluye VAG DIDs
- **WHEN** se invoca `repo.readPid("22", "1130")` con respuesta mock `"62 11 30 0C 80"`
- **THEN** devuelve `800` (fórmula desde `VAG_AUDI_MODE_22_PIDS` en seed, no hardcode)

#### Scenario: PID desconocido con fallback big-endian
- **GIVEN** `Elm327TcpRepository` con catálogo de seed data
- **WHEN** se invoca `repo.readPid("01", "ZZ")` con respuesta mock `"41 ZZ 0C 80"`
- **THEN** devuelve `3200` (big-endian fallback, sin cambios de comportamiento)
