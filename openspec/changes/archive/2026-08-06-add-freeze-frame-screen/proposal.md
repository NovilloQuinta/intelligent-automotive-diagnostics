## Why

Autel MaxiSys permite, al seleccionar un DTC en la lista de códigos de fallo, abrir su "Freeze Frame Data": los valores de sensores congelados en el instante en que se disparó ese código. El dominio ya tiene el VO `FreezeFrame` (`domain/value-objects/freezeFrame.ts`), el método `ObdRepository.getFreezeFrame(dtc?)`, la tool MCP `get_freeze_frame` y `ProcessVehicleDiagnosisUseCase` ya lee el freeze frame — pero **el resultado nunca sale estructurado hacia la UI**: `DiagnosisService.diagnose()` colapsa `DiagnosisResult.freezeFrame` en una línea de texto dentro de `diagnosisText` (`buildDiagnosisText`), y el tipo `DiagnoseOutput`/`DiagnosisResponse` (frontend) no tiene ningún campo `freezeFrame`. Además, `getFreezeFrame(dtc?)` en la simulación (`ObdSimulator.getFreezeFrame`) ignora hoy el parámetro `dtc` — siempre devuelve el único freeze frame del escenario activo, sin importar qué código se pase.

Sin datos estructurados no hay pantalla posible: hace falta exponer el freeze frame como JSON (no solo como texto narrativo) y, dado que el panel de DTCs (`DtcPanel`) ya lista los códigos, la interacción natural es seleccionar un código para ver su freeze frame asociado — igual que en Autel.

## What Changes

- **`DtcPanel` interactivo**: las filas de DTC pasan a ser seleccionables (`onSelectDtc(code)`), con estado visual de selección (mismo patrón de estilo que el resto del panel).
- **Nuevo endpoint `GET /api/freeze-frame?scenarioId=&dtc=`** en `DiagnosisController`/`diagnosis.routes.ts`: devuelve `{ freezeFrame: FreezeFrame | null }` estructurado, delegando en `repository.getFreezeFrame(dtc)` (sin pasar por la tool MCP, que devuelve texto narrativo).
- **`ObdSimulator.getFreezeFrame(dtc)` respeta el parámetro `dtc`**: si se pasa un código que no coincide con `scenario.freezeFrame.dtcCode`, devuelve `null` en vez de ignorarlo (comportamiento actual). Documentado como limitación: un escenario solo modela un freeze frame (1 DTC con datos congelados); Non-Goal ampliar a multi-DTC en este cambio.
- **Nuevo componente UI `FreezeFramePanel`** (`apps/ui/src/components/dashboard/FreezeFramePanel.tsx`) + hook `useFreezeFrame`: muestra los valores de PIDs congelados del DTC seleccionado, en un panel lateral o modal anclado a `DtcPanel`.
- **Extensión de `DashboardPage`**: estado `selectedDtc` compartido entre `DtcPanel` y `FreezeFramePanel`.

## Capabilities

### New Capabilities
- `freeze-frame-screen`: Visualización de los valores de sensores congelados (freeze frame) asociados a un DTC seleccionado en el panel de códigos de fallo, alimentada por un nuevo endpoint estructurado sobre `ObdRepository.getFreezeFrame(dtc)`.

## Impact

- Modificado: `apps/core-api/src/infrastructure/simulation/simulator.ts` (`getFreezeFrame` respeta `dtc`)
- Modificado: `apps/core-api/src/infrastructure/services/diagnosisService.ts` (+`getFreezeFrame(scenarioId, dtc)`)
- Modificado: `apps/core-api/src/infrastructure/http/controllers/DiagnosisController.ts`, `routes/diagnosis.routes.ts` (+`GET /api/freeze-frame`)
- Nuevo: `apps/ui/src/components/dashboard/FreezeFramePanel.tsx`, `useFreezeFrame.ts`
- Modificado: `apps/ui/src/components/dashboard/DtcPanel.tsx` (selección de DTC)
- Modificado: `apps/ui/src/components/dashboard/DashboardPage.tsx` (estado `selectedDtc`)
- Modificado: `apps/ui/src/components/dashboard/types.ts`, `apps/ui/src/lib/api.ts` (+`getFreezeFrame()`)
- Tests unitarios correspondientes en `apps/core-api/tests/unit/` y `apps/ui/tests/unit/`
