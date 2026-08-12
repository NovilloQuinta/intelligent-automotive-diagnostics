## 0. Preparación

- [ ] 0.1 `@orchestrator` — enrutar cambio: `@writer` (backend core-api, sin UI), skills (`clean-architecture`, `typescript-best-practices`, `tdd-workflow`, `tsdoc-jsdoc-documentation`)
- [ ] 0.2 Verificar baseline en `develop`: `pnpm lint && pnpm format && pnpm test && pnpm build` en verde
- [ ] 0.3 Crear rama `feat/add-ecu-discovery-and-system-catalog` desde `develop`
- [ ] 0.4 Confirmar con el usuario la migración de schema (regla del proyecto: el schema Drizzle no cambia sin discusión) antes de tocar `schema.ts`

## 1. Domain — entidades y catálogo de direcciones

### 1.1 RED — tests de entidad PidDefinition con `system` y sin `vehicleId`/`ecuId`
- **Capa**: domain
- **Archivos**: `apps/core-api/tests/unit/domain/entities/pidDefinition.test.ts` (modificar o crear)
- **Descripción**: Tests que verifiquen:
  - `new PidDefinition({ ... system: 'Battery' })` expone `system = 'Battery'`
  - `new PidDefinition(...)` sin `system` → `system === undefined`
  - El constructor ya no acepta `vehicleId`/`ecuId` (compila sin ellos; si se pasan, se ignoran/eliminan del tipo)
  - `system` inválido (vacío tras trim) no lanza — `system` es opcional
- **Tests**: `pidDefinition.test.ts` — 3-4 tests

### 1.2 RED — tests de entidad PidReading con `mode`/`pidCode`/`sessionId: number`
- **Capa**: domain
- **Archivos**: `apps/core-api/tests/unit/domain/entities/pidReading.test.ts` (modificar)
- **Descripción**: Tests que verifiquen:
  - `new PidReading({ mode: '01', pidCode: '0C', sessionId: 42, rawHex: '41 0C 1A F8' })` valida y normaliza
  - `mode`/`pidCode` vacíos lanzan `PidReadingError`
  - `sessionId` es `number` (no string); `rawHex` sigue validando hex
  - `pidDefId` sigue opcional (undefined)
- **Tests**: `pidReading.test.ts` — 3-4 tests

### 1.3 RED — tests del catálogo de direcciones CAN (domain)
- **Capa**: domain
- **Archivos**: `apps/core-api/tests/unit/domain/ecuAddressCatalog.test.ts` (crear)
- **Descripción**: Tests para el catálogo ISO 15765-4 (solo estándar, sin inventar nombres):
  - `resolveEcuAddress('7E8')` → `{ type: 'ECM', name: 'Engine Control Module', requestAddr: '7E0' }`
  - `resolveEcuAddress('7E9')`, `'7DA'`, `'768'`, `'728'` → todas `{ type: 'UNKNOWN', name: 'ECU <addr>', requestAddr: <addr − 8> }` (NO se asignan TCM/SRS/ABS/IPC)
  - Dirección desconocida (`'7EC'`) → `{ type: 'UNKNOWN', name: 'ECU 7EC', requestAddr: '7E4' }` (derivada `response − 8`)
  - `requestAddr` derivado aritméticamente: `responseAddr − 8` en hex
- **Tests**: `ecuAddressCatalog.test.ts` — 5-6 tests

### 1.4 GREEN — implementar entidades y catálogo
- **Capa**: domain
- **Archivos**: `src/domain/entities/pidDefinition.ts`, `src/domain/entities/pidReading.ts` (modificar); `src/domain/ecuAddressCatalog.ts` (crear)
- **Dependencias**: Task 1.1, 1.2, 1.3
- **Descripción**: Añadir `system?: string` a `PidDefinition` y quitar `vehicleId`/`ecuId`; reescribir `PidReading` con `mode`, `pidCode`, `sessionId: number` (y `pidDefId?`); crear `ecuAddressCatalog.ts` como constante pura con **una única entrada estándar** (`7E8 → ECM`) + función `resolveEcuAddress(responseAddr)` que deriva `request = response − 8` y devuelve `UNKNOWN` para el resto, sin imports de capas superiores.
- **Criterio de aceptación**: los tests RED de 1.1-1.3 pasan

### 1.5 REFACTOR
- **Descripción**: Verificar que `resolveEcuAddress` extrae la regla `response − 8` en un helper reutilizable (no repetido por entrada). Revisar que el vocabulario de `system` queda documentado (TSDoc) y que `PidReading` no arrastra lógica de validación duplicada entre `mode`/`pidCode`.

## 2. Schema + migración 0005

### 2.1 RED — tests de schema para columnas nuevas
- **Capa**: infrastructure
- **Archivos**: `apps/core-api/tests/unit/infrastructure/persistence/sqlite/schema.test.ts` (crear o modificar, si existe patrón de schema test)
- **Descripción**: Tests que verifiquen (vía el objeto de schema de Drizzle, sin BD real, o con SQLite in-memory):
  - `pidDefinitions` NO expone `vehicleId`/`ecuId`
  - `pidDefinitions` expone `system` (nullable text)
  - `pidReadings` expone `mode` (notNull), `pidCode` (notNull), `sessionId` (integer, FK a diagnosisSessions), `pidDefId` (nullable)
- **Tests**: `schema.test.ts` — 4-5 tests

### 2.2 GREEN — schema.ts
- **Capa**: infrastructure
- **Archivos**: `apps/core-api/src/infrastructure/persistence/sqlite/schema.ts` (modificar)
- **Dependencias**: Task 2.1, Task 1.4 (entidades)
- **Descripción**:
  - `pidDefinitions`: quitar `vehicleId`/`ecuId`; añadir `system: text('system')` (nullable); mantener unique index `(mode, pidCode, manufacturer, model)`
  - `pidReadings`: añadir `mode`/`pidCode` notNull; `sessionId` → `integer('session_id').notNull().references(() => diagnosisSessions.id)`; mantener `pidDefId` nullable FK; añadir index en `sessionId`
  - `ecuDefinitions`: nueva tabla `ecu_definitions` con `manufacturer`/`model`/`responseAddr`/`requestAddr`/`name`/`type`/`system` (nullable)/`confidence`/`source` + unique `(manufacturer, model, responseAddr)`
- **Criterio de aceptación**: tests de 2.1 pasan

### 2.3 GREEN — migración 0005
- **Capa**: infrastructure
- **Archivos**: `apps/core-api/drizzle/0005_*.sql` (crear vía `pnpm drizzle-kit generate` en `apps/core-api`)
- **Dependencias**: Task 2.2
- **Descripción**: Generar migración con `drizzle-kit generate` y revisar el SQL generado:
  - `pid_definitions`: rebuild `__new_` sin `vehicle_id`/`ecu_id`, con `system text`; recrear unique index
  - `pid_readings`: rebuild con `mode`/`pid_code` NOT NULL, `session_id` integer FK, `pid_def_id` nullable, index `(session_id)`
  - `ecu_definitions`: crear tabla nueva (vacía, sin seed) con unique `(manufacturer, model, response_addr)`
  - Asegurar `PRAGMA foreign_keys=OFF`/`ON` alrededor del rebuild (patrón 0002)
- **Criterio de aceptación**: `pnpm drizzle-kit migrate` aplica sin error sobre una DB con datos de seed

### 2.4 REFACTOR
- **Descripción**: Verificar que la migración no arrastra columnas muertas ni constraints duplicadas. Confirmar que el reset de `pid_readings` está documentado en el SQL (comentario) o en el design. Sin duplicación de lógica de migración.

## 3. VehicleRepository — persistencia de PIDs y lecturas

### 3.1 RED — tests de vehicleRepository
- **Capa**: infrastructure
- **Archivos**: `apps/core-api/tests/unit/infrastructure/persistence/sqlite/vehicleRepository.test.ts` (modificar)
- **Descripción**: Tests que verifiquen:
  - `insertPidDefinition` persiste `system` y NO escribe `vehicle_id`/`ecu_id`
  - `findPidDefinition` sigue funcionando por `(mode, pidCode, manufacturer, model)`
  - Nuevo `findPidsByManufacturerModel('Audi', 'A3')` devuelve los PIDs seed de ese scope (y los universales `manufacturer = ''`)
  - `insertPidReading` persiste `mode`/`pidCode`/`sessionId` (int) y devuelve la fila con id
- **Tests**: `vehicleRepository.test.ts` — 4-6 tests

### 3.2 GREEN — vehicleRepository.ts
- **Capa**: infrastructure
- **Archivos**: `apps/core-api/src/infrastructure/persistence/sqlite/vehicleRepository.ts` (modificar); `apps/core-api/src/application/ports/VehicleRepository.ts` (modificar)
- **Dependencias**: Task 3.1, Task 2.2
- **Descripción**:
  - `toPidDefinition` mapper: leer `system`, no leer `vehicleId`/`ecuId`
  - `insertPidDefinition`: escribir `system`, no `vehicleId`/`ecuId`
  - Sustituir `findPidsByVehicle(vehicleId)` por `findPidsByManufacturerModel(manufacturer, model)` (con fallback a definiciones globales `manufacturer = ''`); eliminar `findPidsByVehicle` del puerto
  - `insertPidReading`: escribir `mode`/`pidCode`/`sessionId` (int)
- **Criterio de aceptación**: tests de 3.1 pasan; `tsc` compila sin referencias a `findPidsByVehicle`

### 3.3 REFACTOR
- **Descripción**: Revisar que `findPidsByManufacturerModel` reutiliza el patrón de `findPidDefinition` (condiciones SQL), sin duplicar la normalización manufacturer/model. Verificar que no queda código muerto (`findPidsByVehicle`) en ningún llamador.

## 4. Descubrimiento de ECUs (adapter + protocol)

### 4.1 RED — tests de parseCanHeaders (protocol.ts)
- **Capa**: infrastructure
- **Archivos**: `apps/core-api/tests/unit/infrastructure/elm327/protocol.test.ts` (modificar)
- **Descripción**: Tests para `parseCanHeaders(raw)`:
  - `raw = "7E8 06 41 00 BE 3F A8 13\r7E9 06 41 00 ...\r7E8 28 ...\r>"` → `['7E8', '7E9']` (dedupe, orden de aparición)
  - Respuesta sin headers (single ECU sin `AT H1`): devuelve `[]`
  - Headers 29-bit (ej. `18DAF110`) se ignoran (scope 11-bit)
  - Líneas vacías y el prompt `>` se descartan
  - Headers fuera del rango `7E8–7EF` se descartan
- **Tests**: `protocol.test.ts` — 5-6 tests

### 4.2 RED — tests de ecuDiscovery (mock de transporte)
- **Capa**: infrastructure
- **Archivos**: `apps/core-api/tests/unit/infrastructure/elm327/ecuDiscovery.test.ts` (crear)
- **Descripción**: Con un mock `Elm327Transport` que guiona respuestas, verificar:
  - `discoverEcus(transport)` emite la secuencia AT exacta (`AT E0`, `AT L0`, `AT H1`, `AT SP 6`, `AT SH 7DF`) en orden, luego `01 00`
  - Con respuesta broadcast multi-ECU (`7E8`, `7E9`, `7DA`) devuelve 3 `EcuInfo`: `7E8` → ECM, `7E9`/`7DA` → `UNKNOWN` (con `requestAddr` derivado `response − 8`)
  - Con broadcast vacío, cae al fallback: emite `AT SH 7E0` + `09 0A` y devuelve 1 ECM (7E0/7E8)
  - Con broadcast vacío y 09 0A también vacío/`NO DATA`, devuelve `[]`
  - El mock registra los comandos emitidos (assert de secuencia)
- **Tests**: `ecuDiscovery.test.ts` — 5-6 tests

### 4.3 GREEN — parseCanHeaders + ecuDiscovery
- **Capa**: infrastructure
- **Archivos**: `src/infrastructure/elm327/protocol.ts` (modificar); `src/infrastructure/elm327/ecuDiscovery.ts` (crear)
- **Dependencias**: Task 4.1, 4.2, Task 1.4 (catálogo)
- **Descripción**:
  - `protocol.ts`: añadir `parseCanHeaders(raw)` — extrae IDs CAN de 3 hex del inicio de cada línea, filtra rango `7E8–7EF`, dedupe
  - `ecuDiscovery.ts` (factory function `discoverEcus(transport): Promise<EcuInfo[]>`): secuencia AT → broadcast `01 00` → `parseCanHeaders` → mapeo vía `resolveEcuAddress` → fallback 09 0A
- **Criterio de aceptación**: tests de 4.1 y 4.2 pasan

### 4.4 GREEN — elm327Adapter.getEcuInfo() real
- **Capa**: infrastructure
- **Archivos**: `apps/core-api/src/infrastructure/elm327/elm327Adapter.ts` (modificar)
- **Dependencias**: Task 4.3
- **Descripción**: Sustituir el stub `getEcuInfo() { return [] }` por `return discoverEcus(this.client)`. El adapter solo delega; no contiene lógica de scan.
- **Criterio de aceptación**: tests de `elm327Adapter.test.ts` (actualizar el stub test) pasan

### 4.5 REFACTOR
- **Descripción**: Revisar que `ecuDiscovery.ts` es una única responsabilidad (orquestación del scan) y que el parseo de headers vive en `protocol.ts`. Verificar que la secuencia AT es una constante nombrada (`ECU_SCAN_INIT_SEQUENCE`) y no literales dispersos. El adapter no crece por encima de su responsabilidad.

## 5. Catálogo auto-expansivo de ECUs (opción B)

### 5.1 RED — tests de entidad EcuDefinition
- **Capa**: domain
- **Archivos**: `apps/core-api/tests/unit/domain/entities/ecuDefinition.test.ts` (crear)
- **Descripción**: Tests que verifiquen:
  - `EcuDefinition` con `manufacturer`/`model`/`responseAddr`/`requestAddr`/`name`/`type`/`confidence`/`source` normaliza direcciones a mayúsculas y expone `system` opcional
  - `name` vacío lanza `EcuDefinitionError`
  - `responseAddr`/`requestAddr` no-hex lanzan `EcuDefinitionError`
  - `confidence` fuera de `[0,1]` lanza `EcuDefinitionError`
- **Tests**: `ecuDefinition.test.ts` — 4 tests

### 5.2 RED — tests de schema + repository para `ecu_definitions`
- **Capa**: infrastructure
- **Archivos**: `apps/core-api/tests/unit/infrastructure/persistence/sqlite/vehicleRepository.test.ts` (modificar); `schema.test.ts` (modificar)
- **Descripción**: Tests que verifiquen:
  - `ecuDefinitions` expone `manufacturer`/`model`/`response_addr`/`request_addr`/`name`/`type`/`system` (nullable)/`confidence`/`source` + unique `(manufacturer, model, response_addr)`
  - `upsertEcuDefinition` inserta y actualiza por unique key
  - `findEcuDefinitionByAddress('Audi', 'A3', '7E9')` devuelve la definición o `null`
- **Tests**: 4 tests

### 5.3 RED — tests de resolución + tools MCP
- **Capa**: infrastructure
- **Archivos**: `apps/core-api/tests/unit/infrastructure/mcp/mcpServer.test.ts` (modificar)
- **Descripción**: Tests que verifiquen:
  - `resolveEcuDefinitions(ecus, manufacturer, model)` resuelve `UNKNOWN` (7E9) a nombre/tipo reales si existe definición con `confidence ≥ 0.7`; mantiene `UNKNOWN` si no hay match o `confidence < 0.7`
  - `handleGetEcuInfo` persiste ECUs con nombre/tipo resueltos
  - tools `search_similar_ecus` e `index_ecu` registradas; `index_ecu` escribe en `ecu_definitions`
- **Tests**: 4 tests

### 5.4 GREEN — entidad + schema + repository + resolución + tools + índice vectorial
- **Capa**: domain + infrastructure
- **Archivos**: `src/domain/entities/ecuDefinition.ts` (crear); `schema.ts` (modificar — tabla `ecu_definitions`); `vehicleRepository.ts` + `application/ports/VehicleRepository.ts` (modificar — `findEcuDefinitionByAddress`/`upsertEcuDefinition`); `mcpServer.ts` (modificar — `resolveEcuDefinitions` + tools); `vectorTableConfigs.ts` + `application/knowledge/ecuKnowledgeMapper.ts` + `KnowledgeStack.ts`/`composition.ts` (modificar — `ecus_index`)
- **Dependencias**: Tasks 5.1, 5.2, 5.3, 2.2 (schema), 2.3 (migración), 4.4 (descubrimiento)
- **Descripción**: Implementar entidad con validación; tabla `ecu_definitions` + migración; métodos de repository; `resolveEcuDefinitions` (threshold 0.7); tools MCP `search_similar_ecus`/`index_ecu`; índice `ecus_index` en el stack vectorial (espejo de `dtcs_index`).
- **Criterio de aceptación**: tests de 5.1-5.3 pasan

### 5.5 REFACTOR
- **Descripción**: `ecuKnowledgeMapper` reutiliza el patrón de `dtcKnowledgeMapper`/`pidKnowledgeMapper` sin duplicar. `resolveEcuDefinitions` es función pura. Sin magic strings en `source`/`type` (constantes si se repiten 3+).

## 6. mcpServer — persistencia de lecturas y catálogo de PIDs

### 6.1 RED — tests de persistPidReading y get_available_pids
- **Capa**: infrastructure
- **Archivos**: `apps/core-api/tests/unit/infrastructure/mcp/mcpServer.test.ts` (modificar)
- **Descripción**: Tests que verifiquen:
  - `persistPidReading` escribe `mode`/`pidCode`/`sessionId` (int) y `pidDefId` cuando la definición existe; `pidDefId` null cuando no
  - `handleGetAvailablePids` usa `findPidsByManufacturerModel(sessionContext.manufacturer, sessionContext.model)` (no `findPidsByVehicle`)
  - Lectura sin sesión activa no escribe (comportamiento existente se mantiene)
- **Tests**: `mcpServer.test.ts` — 3-4 tests

### 6.2 GREEN — mcpServer.ts
- **Capa**: infrastructure
- **Archivos**: `apps/core-api/src/infrastructure/mcp/mcpServer.ts` (modificar)
- **Dependencias**: Task 6.1, Task 3.2, Task 4.4, Task 5.4
- **Descripción**:
  - `persistPidReading`: construir `PidReading` con `mode`/`pidCode`/`sessionId: number` (sin `String()`), `pidDefId` del lookup
  - `handleGetAvailablePids`: sustituir `findPidsByVehicle(vehicleId)` por `findPidsByManufacturerModel(manufacturer, model)` usando `sessionContext` (fallback `findPidsByMode`)
- **Criterio de aceptación**: tests de 5.1 pasan

### 6.3 REFACTOR
- **Descripción**: Revisar que `persistPidReading` no duplica la lógica de lookup (`findPidDefinition` con/sin manufacturer). Si `handleGetAvailablePids` crece, extraer helper de agregación de PIDs (Mode 01 scan + BD). Mantener el patrón fire-and-forget sin cambios.

## 7. Seed — campo `system`

### 7.1 RED — tests de seed con `system`
- **Capa**: infrastructure
- **Archivos**: `apps/core-api/tests/unit/infrastructure/persistence/sqlite/seedManufacturerCatalog.test.ts` (modificar o crear)
- **Descripción**: Tests que verifiquen:
  - `seedManufacturerCatalog` inserta PIDs con `system` correcto (ej. TCU Odometer → `Transmission`, Hybrid Battery SoC → `Battery`, DPF Soot → `Exhaust`)
  - Los PIDs Mode 01 universales (`seed-pids.ts`) llevan `system` (ej. RPM → `Engine`, Speed → `Vehicle`)
- **Tests**: `seedManufacturerCatalog.test.ts` — 3-4 tests

### 7.2 GREEN — seeds con `system`
- **Capa**: infrastructure
- **Archivos**: `apps/core-api/src/infrastructure/persistence/sqlite/seedManufacturerCatalog.ts` (modificar); `apps/core-api/src/infrastructure/persistence/sqlite/seed-pids.ts` (modificar)
- **Dependencias**: Task 7.1, Task 1.4
- **Descripción**: Añadir `system` a `MANUFACTURER_PID_SEEDS` (Transmission/Engine/Battery/Exhaust/Emissions/Vehicle según cada PID) y a `STANDARD_MODE_01_PIDS` (Engine por defecto; Speed/Fuel Level/Ambient → Vehicle).
- **Criterio de aceptación**: tests de 6.1 pasan

### 7.3 REFACTOR
- **Descripción**: Verificar que el vocabulario de `system` es consistente entre seeds (mismo valor para mismos sistemas). Sin literales mágicos: usar constantes si el mismo valor se repite 3+ veces.

## 8. Verificación y cierre

- [ ] 8.1 Ejecutar `pnpm test` en `apps/core-api` — todos los tests verdes, sin regresiones
- [ ] 8.2 Ejecutar `pnpm lint && pnpm format` — sin errores
- [ ] 8.3 `pnpm drizzle-kit migrate` sobre DB de desarrollo con datos seed — migración 0005 aplica limpia y `ecu_definitions` queda vacía
- [ ] 8.4 `@reviewer` sobre el diff completo (domain + infrastructure, sin UI)
- [ ] 8.5 `@security`: auditar que el scan AT no introduce inyección (los comandos AT son constantes, no input de usuario) y que la FK `session_id` no expone datos entre sesiones
- [ ] 8.6 `pnpm test:coverage` en `apps/core-api` — thresholds (Core 100%, Features ≥80%)
- [ ] 8.7 `pnpm build` en `apps/core-api` — compila sin errores
- [ ] 8.8 Verificación manual contra emulador Docker: `getEcuInfo()` devuelve 1 ECU ECM (7E8) vía handshake AT — single-ECU es el comportamiento esperado del emulador (tratado como coche real)
- [ ] 8.9 Verificación manual: `search_similar_ecus` devuelve vacío al inicio; `index_ecu` inserta en `ecu_definitions` y un segundo scan resuelve la dirección
- [ ] 8.10 Actualizar `SESION ACTUAL` en `AGENTS.md`
- [ ] 8.11 Sincronizar/actualizar `openspec/specs/ecu-info-screen/spec.md` (supersede del escenario TCP sintético) — al archivar con `/opsx-archive`
- [ ] 8.12 **Preguntar antes de commitear/pushear** (regla 7)
