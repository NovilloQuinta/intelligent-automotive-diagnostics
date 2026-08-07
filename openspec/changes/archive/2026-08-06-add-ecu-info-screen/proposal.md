## Why

Autel MaxiSys expone una pantalla "ECU Information" que lista, para el vehículo conectado, cada unidad de control descubierta (nombre, dirección CAN de petición/respuesta, tipo, protocolo). Nuestro dominio ya tiene la entidad `EcuInfo` (`domain/entities/ecuInfo.ts`) y un puerto de persistencia `VehicleRepository` (`insertEcu`, `findEcusByVehicle`) con su adaptador SQLite (`SqliteVehicleRepository`), pero **ninguno de los dos está conectado al flujo de diagnóstico real**: `VehicleRepository` nunca se instancia en `infrastructure/composition/composition.ts`, no hay tool MCP `get_ecu_info`, no hay endpoint HTTP, y `SimulationScenario`/`ObdRepository` no tienen ningún campo o método relacionado con ECUs. El catálogo SQLite es un concepto distinto (histórico, indexado por VIN) del flujo actual, que es 100% dirigido por `scenarioId` a través de `ObdRepository`.

Para que la pantalla "Información de ECU" tenga sentido en el dashboard actual (que muestra telemetría y diagnóstico en vivo por escenario, no un catálogo histórico), la información de ECUs debe fluir por el mismo camino que `VehicleInfo`, `DtcCode` y `FreezeFrame`: un método en `ObdRepository`, alimentado por el escenario simulado o por el adaptador ELM327 TCP, expuesto tanto como tool MCP (para que el LLM pueda citarlo en el diagnóstico cognitivo) como endpoint REST estructurado (para que la UI renderice una tabla).

## What Changes

- **Extensión de `ObdRepository`**: nuevo método `getEcuInfo(): Promise<EcuInfo[]>` (Service equivalente a un escaneo funcional CAN — sin ISO-TP/UDS real, ver Non-Goals en `design.md`).
- **`SimulationScenario` extendido**: campo opcional `ecus?: EcuInfo[]` (mismo patrón que `freezeFrame?`); `ObdSimulator`/`ObdSimulatorRepository` lo exponen vía `getEcuInfo()`.
- **`Elm327TcpRepository.getEcuInfo()`**: implementación mínima que devuelve una única `EcuInfo` sintética (la ECU de motor, direcciones `7E0`/`7E8` estándar OBD-II) — no hay descubrimiento multi-ECU real (fuera de alcance, ver Non-Goals).
- **7ª tool MCP `get_ecu_info`**: registrada en `mcpServer.ts` junto a las 6 existentes, narrativa de texto para el LLM.
- **Nuevo método `DiagnosisService.getEcuInfo(scenarioId?)`**: resuelve el repositorio y devuelve `EcuInfo[]` estructurado (no el texto narrativo de la tool MCP).
- **Nuevo endpoint `GET /api/ecu-info?scenarioId=`** en `DiagnosisController`/`diagnosis.routes.ts`: devuelve `{ ecus: EcuInfo[] }`.
- **Nuevo componente UI `EcuInfoPanel`** (`apps/ui/src/components/dashboard/EcuInfoPanel.tsx`) + hook `useEcuInfo`: tabla de ECUs (nombre, addr request/response, tipo, protocolo) integrada en `DashboardPage` junto a `DtcPanel`/`DiagnosisPanel`, cargada al seleccionar un vehículo.
- **Datos de ECU en `seedScenarios.ts`**: al menos una ECU por escenario existente (`audi-a3-idle`, `kawa-z900`) para que la pantalla tenga datos de demo reales.

## Capabilities

### New Capabilities
- `ecu-info-screen`: Pantalla de información de ECUs descubiertas en el vehículo activo, alimentada por un nuevo método `getEcuInfo()` del `ObdRepository`, tool MCP `get_ecu_info` y endpoint `GET /api/ecu-info`.

## Impact

- Modificado: `apps/core-api/src/application/ports/ObdRepository.ts` (+`getEcuInfo()`)
- Modificado: `apps/core-api/src/infrastructure/simulation/scenario.ts` (+`ecus?`)
- Modificado: `apps/core-api/src/infrastructure/simulation/simulator.ts`, `simulatorAdapter.ts`
- Modificado: `apps/core-api/src/infrastructure/simulation/seedScenarios.ts` (+ECUs de demo)
- Modificado: `apps/core-api/src/infrastructure/elm327/elm327Adapter.ts` (+`getEcuInfo()` mínimo)
- Modificado: `apps/core-api/src/infrastructure/mcp/mcpServer.ts` (+tool `get_ecu_info`)
- Modificado: `apps/core-api/src/infrastructure/services/diagnosisService.ts` (+`getEcuInfo()`)
- Modificado: `apps/core-api/src/infrastructure/http/controllers/DiagnosisController.ts`, `routes/diagnosis.routes.ts` (+`GET /api/ecu-info`)
- Nuevo: `apps/ui/src/components/dashboard/EcuInfoPanel.tsx`, `useEcuInfo.ts`
- Modificado: `apps/ui/src/components/dashboard/DashboardPage.tsx`, `types.ts`
- Modificado: `apps/ui/src/lib/api.ts` (+`getEcuInfo()`)
- Tests unitarios correspondientes en `apps/core-api/tests/unit/` y `apps/ui/tests/unit/`
