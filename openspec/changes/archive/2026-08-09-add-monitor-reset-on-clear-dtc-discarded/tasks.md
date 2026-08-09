## 0. Preparación

- [ ] 0.1 Crear `feat/monitor-reset-on-clear-dtc` desde `develop`
- [ ] 0.2 Verificar baseline: `pnpm lint && pnpm test && pnpm build` en verde en core-api y UI
- [ ] 0.3 Cargar contexto: `proposal.md`, `design.md`, `vehicleStatus.ts`, `diagnosisService.ts`, `VehicleStatusPanel.tsx`

## 1. VehicleStatus.withMonitorsReset()

- [ ] 1.1 RED: test — `VehicleStatus.withMonitorsReset('spark')` devuelve MIL off, 0 DTCs, 11 monitores con supported=true y completed=false
- [ ] 1.2 RED: test — `withMonitorsReset('compression')` usa los monitores de compresión
- [ ] 1.3 GREEN: implementar `withMonitorsReset()` en `vehicleStatus.ts`
- [ ] 1.4 REFACTOR: extraer la creación de monitores a helper compartido con `clean()`

## 2. MonitorLifecycle

- [ ] 2.1 RED: test — `new MonitorLifecycle()` empieza sin estado para ningún escenario
- [ ] 2.2 RED: test — `reset('audi')` marca el estado como reseteado
- [ ] 2.3 RED: test — `apply(status, 'audi')` con estado reseteado devuelve un VehicleStatus con todos los monitores pendientes
- [ ] 2.4 RED: test — `apply(status, 'audi')` sin estado reseteado devuelve el status original intacto
- [ ] 2.5 RED: test — tras 3 `recordPidRead()`, los common tests (índices 0-2) vuelven a completarse
- [ ] 2.6 RED: test — tras 1 `recordDiagnosisRead()`, los engine-specific (índices 3-10) vuelven a completarse
- [ ] 2.7 RED: test — tras 3 lecturas de live-data + 1 diagnóstico, `apply()` devuelve todos los monitores completados (como el original)
- [ ] 2.8 GREEN: implementar `MonitorLifecycle` en `domain/value-objects/monitorLifecycle.ts`
- [ ] 2.9 REFACTOR: con la suite en verde — verificar que no hay imports de infraestructura

## 3. Integración en DiagnosisService

- [ ] 3.1 RED: test — `clearDtcCodes('audi')` llama a `lifecycle.reset('audi')`
- [ ] 3.2 RED: test — `getVehicleStatus('audi')` tras reset devuelve monitores pendientes
- [ ] 3.3 RED: test — `getLiveData('audi')` tras reset incrementa el contador de live-data
- [ ] 3.4 RED: test — tras 3 `getLiveData` + 1 `runDiagnosis`, `getVehicleStatus` vuelve a mostrar todo completado
- [ ] 3.5 GREEN: cablear `MonitorLifecycle` en `DiagnosisService` — `clearDtcCodes` llama a `reset`, `getLiveData` llama a `recordPidRead`, `getVehicleStatus` aplica el lifecycle
- [ ] 3.6 REFACTOR: verificar que el lifecycle no acopla el servicio al dominio (inyección por constructor)

## 4. MCP Tool: get_vehicle_status

- [ ] 4.1 RED: test — `get_vehicle_status` tool devuelve MIL, DTC count, engineType y monitores
- [ ] 4.2 RED: test — tras clearDtc, `get_vehicle_status` refleja monitores pendientes
- [ ] 4.3 GREEN: implementar tool `get_vehicle_status` en `MCPToolHandler`
- [ ] 4.4 Registrar la tool en `createMcpServer` y en el system prompt del LLM

## 5. Verificación

- [ ] 4.1 Suite completa en verde en core-api
- [ ] 4.2 `GET /api/vehicle-status` antes de borrar → 11/11 completados
- [ ] 4.3 `POST /api/clear-dtc` → 200
- [ ] 4.4 `GET /api/vehicle-status` tras borrar → 0/11 completados, MIL off, 0 DTCs
- [ ] 4.5 Esperar 3 segundos con el dashboard abierto → common tests completados
- [ ] 4.6 `POST /api/diagnosis` → engine-specific completados, 11/11 en verde
- [ ] 4.7 UI: el panel VehicleStatus refleja el cambio (⚠️ amarillos → ✅ verdes)
