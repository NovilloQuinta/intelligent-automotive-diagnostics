## 1. RED — ObdSimulator.getFreezeFrame filtra por dtc

- [x] 1.1 Añadir tests en `tests/unit/infrastructure/simulation/simulator.test.ts`:
  - `getFreezeFrame('P0301')` con freeze frame coincidente → devuelve el `FreezeFrame`
  - `getFreezeFrame('P0420')` con freeze frame no coincidente → devuelve `null`
  - `getFreezeFrame()` sin argumento → comportamiento actual (sin cambios, regresión)

## 2. GREEN — Implementar filtrado

- [x] 2.1 Modificar `src/infrastructure/simulation/simulator.ts`: `getFreezeFrame(dtc?)` compara `frame.dtcCode` con `dtc` cuando se especifica

## 3. RED — DiagnosisService.getFreezeFrame() + endpoint

- [x] 3.1 Añadir tests en `tests/unit/infrastructure/services/diagnosisService.test.ts`:
  - `getFreezeFrame(scenarioId, dtc)` delega en `repository.getFreezeFrame(dtc)`
  - `getFreezeFrame()` con scenarioId inexistente lanza `DiagnosisScenarioNotFoundError`
- [x] 3.2 Añadir tests en `tests/unit/infrastructure/http/routes/diagnosis.routes.test.ts`:
  - `GET /api/freeze-frame?scenarioId=audi-a3-idle&dtc=P0301` → 200 con freeze frame
  - `GET /api/freeze-frame?scenarioId=audi-a3-idle&dtc=P0420` → 200 `{ freezeFrame: null }`
  - `GET /api/freeze-frame?scenarioId=no-existe` → 404
  - `GET /api/freeze-frame?scenarioId=audi-a3-idle` sin `dtc` → 200 sin filtrar

## 4. GREEN — Implementar servicio + endpoint

- [x] 4.1 Modificar `src/infrastructure/services/diagnosisService.ts`: método `getFreezeFrame(scenarioId?, dtc?)`
- [x] 4.2 Modificar `src/infrastructure/http/controllers/DiagnosisController.ts`: handler `freezeFrame` con Zod schema para `req.query` (`scenarioId`, `dtc` opcional)
- [x] 4.3 Modificar `src/infrastructure/http/routes/diagnosis.routes.ts`: `router.get('/freeze-frame', controller.freezeFrame)`
- [x] 4.4 Actualizar `src/infrastructure/http/swagger.ts` con el nuevo endpoint

## 5. RED — UI: DtcPanel seleccionable + useFreezeFrame + FreezeFramePanel

- [x] 5.1 Añadir tests en `apps/ui/tests/unit/lib/api.test.ts`: `api.getFreezeFrame(scenarioId, dtc)` llama a `GET /api/freeze-frame?scenarioId=&dtc=`
- [x] 5.2 Añadir tests en `apps/ui/tests/unit/components/DtcPanel.test.tsx`: click en fila invoca `onSelect(code)`, fila seleccionada tiene estilo distinto
- [x] 5.3 Añadir tests en `apps/ui/tests/unit/components/useFreezeFrame.test.ts`: hook carga freeze frame al cambiar `selectedDtc`, maneja `null`/loading/error
- [x] 5.4 Añadir tests en `apps/ui/tests/unit/components/FreezeFramePanel.test.tsx`: estado vacío (sin selección), tabla de PIDs, "sin freeze frame"

## 6. GREEN — Implementar UI

- [x] 6.1 Modificar `apps/ui/src/components/dashboard/types.ts`: tipo `FreezeFrame`
- [x] 6.2 Modificar `apps/ui/src/lib/api.ts`: `api.getFreezeFrame(scenarioId, dtc)`
- [x] 6.3 Modificar `apps/ui/src/components/dashboard/DtcPanel.tsx`: prop `onSelect`, `selectedCode`, estilo de fila seleccionada
- [x] 6.4 Crear `apps/ui/src/components/dashboard/useFreezeFrame.ts`
- [x] 6.5 Crear `apps/ui/src/components/dashboard/FreezeFramePanel.tsx`
- [x] 6.6 Modificar `apps/ui/src/components/dashboard/DashboardPage.tsx`: estado `selectedDtc`, integrar `FreezeFramePanel`
- [x] 6.7 Actualizar `apps/ui/tests/unit/components/DashboardPage.test.tsx` y `apps/ui/tests/e2e/dashboard.spec.ts` si aplica

## 7. REFACTOR + Verificación

- [x] 7.1 Ejecutar `pnpm lint && pnpm format && pnpm test && pnpm build` — todo verde
- [x] 7.2 Revisar DRY/KISS: reutilización del patrón `resolveRepository` existente, sin duplicar lógica de errores
- [x] 7.3 Actualizar `SESION ACTUAL` en `AGENTS.md`
