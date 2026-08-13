## Why

El modelo de datos actual no refleja cómo trabaja un escáner profesional tipo Autel, y la pieza más llamativa de ese modelo — descubrir **físicamente** qué ECUs hay en el coche — sencillamente no existe.

Hoy `Elm327TcpRepository.getEcuInfo()` devuelve `[]` (stub quitado). El usuario que conecta un coche real por USB ve el panel "Información de ECU" vacío: el sistema no escanea el bus CAN, no pregunta qué módulos responden, no distingue los módulos físicos presentes en el bus. La tabla `ecus` y el flujo `persistEcus` en `mcpServer.ts` ya existen y persisten correctamente cuando hay sesión, pero nadie produce las ECUs que alimentan ese flujo. En el simulador (`ObdSimulatorRepository`) las ECUs sí aparecen — pero están hardcodeadas en `seedScenarios.ts` (ECM/TCM/ABS/BCM/SRS/IPC) como fixture de test, no "descubiertas".

Además, el catálogo de PIDs no tiene el nivel de organización por **sistema/ECU** que un escáner profesional ofrece (Engine, ABS, Transmission, Battery…). `pid_definitions` no agrupa PIDs por sistema, así que la UI no puede presentar "PIDs del motor" vs "PIDs de la batería híbrida" (de hecho ya hay PIDs de batería y odómetro TCU/ECM en el seed que hoy se muestran todos juntos). Y lo que es peor: `pid_definitions` todavía arrastra `vehicle_id` y `ecu_id`, que contradicen el modelo acordado — los PIDs son a nivel fabricante/modelo, no por vehículo (un Audi A3 comparte catálogo de PIDs con otro Audi A3; la relación coche↔PID es **derivada** por `make`/`model`, no un FK).

Por último, `pid_readings` está roto: guarda `pid_def_id` (que sale `null` porque las lecturas en vivo raramente tienen una definición registrada) y **no** guarda `mode`/`pid`, de modo que las lecturas quedan huérfanas e ininterpretables. Además `session_id` es un `text` que no referencia `diagnosis_sessions`, así que no se puede consultar "las lecturas de la sesión N".

## What Changes

1. **Descubrimiento real de ECUs** (feature ausente). `getEcuInfo()` en el adaptador TCP deja de devolver `[]` y ejecuta un **auto-scan CAN por functional addressing**: secuencia AT (`AT E0`/`AT L0`/`AT H1`/`AT SP 6`/`AT SH 7DF`) + broadcast `01 00`, escucha las respuestas con headers activos (`7E8`, `7E9`, …), deriva la dirección de petición (`header − 8`) y mapea **solo** la dirección estandarizada `7E0/7E8` a ECM (el resto se devuelve `UNKNOWN`, sin inventar nombres). Con fallback a **Mode 09 PID 0A** (ECU name) cuando el broadcast no produce respuestas. El emulador y el coche real usan el mismo mecanismo.
2. **Nivel "sistema/ECU" en el catálogo de PIDs**. Nuevo campo `system` (texto) en `pid_definitions` para agrupar PIDs por sistema a nivel fabricante/modelo (Engine, Transmission, Battery, Exhaust…). Se seedea en los PIDs Mode 22 existentes.
3. **`pid_readings` autodescriptivo**. Se añaden `mode` + `pid_code` (NOT NULL) para que cada lectura se interprete sin JOIN a `pid_definitions`; `pid_def_id` se mantiene como FK opcional (soft link a la definición canónica); `session_id` pasa de `text` a FK entero → `diagnosis_sessions.id`.
4. **Migración 0005**. Se eliminan `vehicle_id` y `ecu_id` de `pid_definitions` (los PIDs pasan a ser estrictamente fabricante/modelo), se añade `system`, y se reconstruye `pid_readings` con el nuevo esquema. `findPidsByVehicle` se sustituye por `findPidsByManufacturerModel`.
5. **Catálogo auto-expansivo de ECUs** (opción B). Nuevas `ecu_definitions` (SQLite) + `ecus_index` (LanceDB), ambas **vacías al inicio**. Tras el auto-scan, cada ECU `UNKNOWN` se resuelve contra `ecu_definitions` por `(manufacturer, model, response_addr)` con `confidence ≥ 0.7`; si no hay match, queda `UNKNOWN`. El aprendizaje se hace con las tools MCP `search_similar_ecus` e `index_ecu` (INSERT en BD cuando se obtiene información). Sin seed precargado.

## Capabilities

### Added Capabilities
- `ecu-discovery-and-system-catalog`: el sistema descubre físicamente las ECUs presentes en el bus CAN del vehículo conectado, organiza el catálogo de PIDs por sistema/ECU a nivel fabricante/modelo, y mantiene un catálogo auto-expansivo de ECUs (vacío al inicio) que aprende direcciones → nombre/tipo/sistema con el uso.

### Modified Capabilities
- `ecu-info-screen`: `getEcuInfo()` en modo TCP deja de devolver una "ECU sintética fija de motor" (o `[]`) y pasa a devolver las ECUs realmente descubiertas por el auto-scan CAN.

## Dependencies

No depende de ningún cambio abierto. Se basa en `develop` tal cual está. Relación con cambios activos en el repo:
- `add-live-data-pid-selector`, `add-connection-type-selector`, `add-topology-mapping-screen`, `add-dtc-repair-tips-screen`: independientes (no tocan `getEcuInfo` ni el schema de `pid_definitions`/`pid_readings`).
- Deuda vectorial (columna JSON `metadata` en schema): este cambio **no** la resuelve; añade `system` como columna tipada, coherente con la decisión de "schema-lite" documentada en `AGENTS.md`.

## Impact

- **Modificado**: `apps/core-api/src/infrastructure/persistence/sqlite/schema.ts` — drop `vehicle_id`/`ecu_id`, add `system`, rebuild `pid_readings`
- **Modificado**: `apps/core-api/drizzle/0005_*.sql` (nueva migración)
- **Modificado**: `apps/core-api/src/domain/entities/pidDefinition.ts` — add `system`, remove `vehicleId`/`ecuId`
- **Modificado**: `apps/core-api/src/domain/entities/pidReading.ts` — `mode`/`pidCode`/`sessionId: number`
- **Nuevo**: `apps/core-api/src/domain/ecuAddressCatalog.ts` — mapping ISO 15765-4 (solo `7E0/7E8 = ECM` estandarizada; resto `UNKNOWN`)
- **Nuevo**: `apps/core-api/src/domain/entities/ecuDefinition.ts` — entidad de definición de ECU (catálogo auto-expansivo)
- **Modificado**: `apps/core-api/src/infrastructure/elm327/protocol.ts` — `parseCanHeaders` (headers de tramas multi-ECU)
- **Nuevo**: `apps/core-api/src/infrastructure/elm327/ecuDiscovery.ts` — orquestación del auto-scan
- **Modificado**: `apps/core-api/src/infrastructure/elm327/elm327Adapter.ts` — `getEcuInfo()` real
- **Modificado**: `apps/core-api/src/infrastructure/persistence/sqlite/schema.ts` — nueva tabla `ecu_definitions` (además de drop `vehicle_id`/`ecu_id`, add `system`, rebuild `pid_readings`)
- **Modificado**: `apps/core-api/drizzle/0005_*.sql` — crear `ecu_definitions`
- **Modificado**: `apps/core-api/src/infrastructure/persistence/sqlite/vehicleRepository.ts` — mapper, `insertPidDefinition`, `findPidsByManufacturerModel`, `insertPidReading`, `findEcuDefinitionByAddress`, `upsertEcuDefinition`
- **Modificado**: `apps/core-api/src/infrastructure/mcp/mcpServer.ts` — `persistPidReading` (mode/pid/session FK), `handleGetAvailablePids`, resolución de ECUs contra `ecu_definitions`, tools `search_similar_ecus`/`index_ecu`
- **Modificado**: `apps/core-api/src/infrastructure/persistence/vector/vectorTableConfigs.ts` + `application/knowledge/` — índice `ecus_index` + `ecuKnowledgeMapper`
- **Modificado**: `apps/core-api/src/infrastructure/persistence/sqlite/seedManufacturerCatalog.ts` y `seed-pids.ts` — campo `system`
- **Modificado**: `apps/core-api/src/application/ports/VehicleRepository.ts` — reemplazo de `findPidsByVehicle`, métodos de `ecu_definitions`
- **Sin cambios en UI** (el panel `EcuInfoPanel` ya renderiza `EcuInfo[]`; el agrupamiento por `system` en UI queda para un cambio posterior)
- Tests correspondientes en `protocol.test.ts`, `ecuDiscovery.test.ts`, `elm327Adapter.test.ts`, `vehicleRepository.test.ts`, `mcpServer.test.ts`, `ecuDefinition.test.ts`
