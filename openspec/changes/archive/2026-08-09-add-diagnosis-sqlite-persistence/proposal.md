## Why

El schema SQLite (`schema.ts`) define cuatro tablas que **existen pero nadie escribe durante un diagnóstico**: `vehicles`, `diagnosis_sessions`, `pid_readings` y `ecus`. El repositorio `SqliteVehicleRepository` tiene todos los métodos implementados (`upsertVehicle`, `createSession`, `endSession`, `insertPidReading`, `insertEcu`) y el `VehicleRepository` está inyectado en `DiagnosisService` y `createMcpServer`. Pero ni un solo handler MCP ni el caso de uso invocan estos métodos.

La única escritura viva es `autoRegisterPid()` para `pid_definitions` en `handleReadPid`. Todo lo demás es código muerto.

Cada diagnóstico debería dejar huella: qué vehículo era, en qué sesión, qué PIDs se leyeron, qué ECUs se descubrieron. Sin ese registro, funcionalidades futuras como historial de sesiones por vehículo, tendencias de lecturas, o búsqueda de "¿cuándo fue la última vez que este coche marcó P0301?" no tienen datos sobre los que construirse.

El cambio `add-diagnosis-history` tiene una dependencia implícita de este: su `proposal.md` lo reconoce al decir que *"VehicleRepository sigue sin conectarse"*. Este cambio cierra esa brecha.

**Ampliación de scope: manufacturer/model, dtc_definitions y deduplicación.** La discusión de diseño reveló que las definiciones de PID y DTC no deben estar ligadas a un VIN concreto — tienen sentido a nivel de fabricante + modelo. Un Audi A3 comparte el mismo catálogo de PIDs y DTCs independientemente del número de bastidor. Persistir definiciones por `vehicleId` sin considerar `make` + `model` produce duplicados: dos Audi A3 distintos generan dos conjuntos de PIDs y DTCs idénticos. Para evitarlo, se amplía el scope del cambio con: (a) scope de `manufacturer` + `model` para definiciones compartidas, (b) persistencia de DTC codes en una nueva tabla `dtc_definitions` con dedup por `(manufacturer, model, code)`, y (c) deduplicación de ECUs por `(vehicleId, requestAddr, responseAddr)` para evitar filas repetidas si el LLM llama dos veces a `get_ecu_info`.

## What Changes

- **Session creation/teardown en `DiagnosisService.cognitiveDiagnosis()`**: abre sesión antes de crear el servidor MCP y la cierra en `finally` tras ejecutar el caso de uso. La sesión es best-effort: si SQLite falla, el diagnóstico se devuelve igual.
- **Vehicle upsert al iniciar el diagnóstico**: convierte la info del vehículo obtenida por `ObdRepository.getVehicleInfo()` en un `VehicleProfile` y lo persiste vía `upsertVehicle`. El `vehicleId` resultante se usa para crear la sesión.
- **`SessionContext` ampliado via MCP server**: nuevo parámetro opcional `{ sessionId, vehicleId, manufacturer, model }` en `createMcpServer` y `registerDiagnosticTools`. Los handlers que necesitan escribir (`handleReadPid`, `handleGetEcuInfo`, `handleGetDtcCodes`) reciben este contexto por closure y persisten en fire-and-forget. `manufacturer` y `model` (normalizados) se pasan para scoping de definiciones sin DB round-trip adicional.
- **PID readings**: `handleReadPid` guarda cada lectura (raw hex + parsed value) con el `sessionId` de la sesión activa. Mismo patrón fire-and-forget que `autoRegisterPid`.
- **PID definitions dedup**: antes de registrar una definición, se comprueba si ya existe para el mismo `manufacturer` + `model` + `mode` + `pidCode`. Si existe, se reutiliza; si no, se inserta.
- **ECU writes + dedup**: `handleGetEcuInfo` persiste cada ECU descubierta. Antes de insertar, verifica si ya existe una ECU con el mismo `(vehicleId, requestAddr, responseAddr)` — si existe, solo actualiza `discoveredAt`.
- **DTC definitions table + persistence**: nueva tabla `dtc_definitions` en el schema con `(id, manufacturer, model, code, description, first_seen, last_seen)`. Unicidad por `(manufacturer, model, code)`. `handleGetDtcCodes` persiste los DTC descubiertos durante el diagnóstico.
- **Guards**: todas las escrituras SQLite respetan `if (!vehicleRepo) return` (vehicleRepo es opcional en la configuración). Los fallos de escritura se tragan con `.catch()` — nunca tumban el diagnóstico.

## Capabilities

### New Capabilities
- `diagnosis-sqlite-persistence`: Cableado de las escrituras SQLite (`vehicles`, `diagnosis_sessions`, `pid_readings`, `ecus`, `pid_definitions`, `dtc_definitions`) durante el flujo de diagnóstico cognitivo, con scope de manufacturer/model para definiciones compartidas, deduplicación de ECUs, y degradación si el repositorio no está configurado o falla.

### Modified Capabilities
- Ninguna. Este cambio no modifica comportamiento existente — añade escrituras a una capa de persistencia que ya estaba implementada pero no conectada, y extiende el schema con `dtc_definitions` sin alterar tablas existentes.

## Dependencies

No depende de `add-diagnosis-history` — lo precede. Una vez que este cambio está mergeado, las tablas se pueblan solas durante cada diagnóstico, y `add-diagnosis-history` puede construir sobre datos reales en lugar de un schema vacío.

Depende de `fix-vehicle-identity-and-live-data` (ya mergeado): la identidad del vehículo que se persiste es la corregida por ese cambio.

## Impact

- Modificado: `apps/core-api/src/infrastructure/persistence/sqlite/schema.ts` (+tabla `dtc_definitions`)
- Modificado: `apps/core-api/src/infrastructure/persistence/sqlite/vehicleRepository.ts` (+métodos DTC, +dedup ECU, +búsqueda por manufacturer/model)
- Modificado: `apps/core-api/src/application/ports/VehicleRepository.ts` (+métodos DTC, +findEcuByAddress)
- Modificado: `apps/core-api/src/infrastructure/services/diagnosisService.ts` (+upsert vehicle, +create/end session, +manufacturer/model en SessionContext)
- Modificado: `apps/core-api/src/infrastructure/mcp/mcpServer.ts` (+SessionContext ampliado, +writes en handleReadPid, handleGetEcuInfo, handleGetDtcCodes, +dedup)
- Nuevo: `apps/core-api/src/domain/entities/dtcDefinition.ts` (entidad de dominio)
- Sin cambios: `DiagnosisSession`, `EcuInfo`, `PidReading`, `PidDefinition`, `VehicleProfile` — entidades de dominio sin tocar
- Sin cambios: `ExecuteCognitiveDiagnosisUseCase`, `ProcessVehicleDiagnosisUseCase` — la sesión se maneja en la capa de infraestructura
- Tests unitarios en `apps/core-api/tests/unit/`
