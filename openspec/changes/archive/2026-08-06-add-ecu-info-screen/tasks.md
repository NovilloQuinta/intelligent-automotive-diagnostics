## 1. RED — ObdRepository.getEcuInfo() (dominio + simulación + TCP)

- [ ] 1.1 Añadir tests en `tests/unit/infrastructure/simulation/simulatorAdapter.test.ts` y `simulator.test.ts`:
  - `getEcuInfo()` devuelve las ECUs del `SimulationScenario.ecus`
  - `getEcuInfo()` devuelve `[]` si el escenario no define `ecus`
- [ ] 1.2 Añadir tests en `tests/unit/infrastructure/elm327/elm327Adapter.test.ts`:
  - `getEcuInfo()` devuelve una `EcuInfo` sintética fija (`7E0`/`7E8`, `ECM`, `ISO 15765-4 (CAN 11/500)`)

## 2. GREEN — Implementar getEcuInfo()

- [ ] 2.1 Modificar `src/application/ports/ObdRepository.ts`: añadir `getEcuInfo(): Promise<EcuInfo[]>` con TSDoc
- [ ] 2.2 Modificar `src/infrastructure/simulation/scenario.ts`: `ecus?: EcuInfo[]` en `SimulationScenario`
- [ ] 2.3 Modificar `src/infrastructure/simulation/simulator.ts`: `getEcus()` → `this.scenario.ecus ?? []`
- [ ] 2.4 Modificar `src/infrastructure/simulation/simulatorAdapter.ts`: `getEcuInfo()` → `this.simulator.getEcus()`
- [ ] 2.5 Modificar `src/infrastructure/elm327/elm327Adapter.ts`: `getEcuInfo()` con la ECU sintética fija (constante interna, no mágica inline)
- [ ] 2.6 Modificar `src/infrastructure/simulation/seedScenarios.ts`: añadir `ecus: [...]` a `audi-a3-idle` y `kawa-z900`

## 3. RED — Tool MCP get_ecu_info

- [ ] 3.1 Añadir tests en `tests/unit/infrastructure/mcp/mcpServer.test.ts`:
  - `get_ecu_info` devuelve texto narrativo con nombre/direcciones/protocolo de cada ECU
  - `get_ecu_info` sin ECUs devuelve "No ECUs discovered." (o equivalente)
  - `listTools()` incluye 7 tools (las 6 existentes + `get_ecu_info`)

## 4. GREEN — Registrar tool get_ecu_info

- [ ] 4.1 Modificar `src/infrastructure/mcp/mcpServer.ts`: `handleGetEcuInfo(repo)` + registro en `registerDiagnosticTools`

## 5. RED — DiagnosisService.getEcuInfo() + endpoint

- [ ] 5.1 Añadir tests en `tests/unit/infrastructure/services/diagnosisService.test.ts`:
  - `getEcuInfo(scenarioId)` devuelve `EcuInfo[]` estructurado (no texto)
  - `getEcuInfo()` sin scenarioId en modo simulación lanza `DiagnosisScenarioNotFoundError`
- [ ] 5.2 Añadir tests en `tests/unit/infrastructure/http/routes/diagnosis.routes.test.ts`:
  - `GET /api/ecu-info?scenarioId=audi-a3-idle` → 200 `{ ecus: [...] }`
  - `GET /api/ecu-info?scenarioId=no-existe` → 404
  - `GET /api/ecu-info` sin query en modo simulación → 400
  - `GET /api/ecu-info` sin query en modo TCP directo → 200

## 6. GREEN — Implementar servicio + endpoint

- [ ] 6.1 Modificar `src/infrastructure/services/diagnosisService.ts`: método `getEcuInfo(scenarioId?)`
- [ ] 6.2 Modificar `src/infrastructure/http/controllers/DiagnosisController.ts`: handler `ecuInfo` con Zod schema para `req.query`
- [ ] 6.3 Modificar `src/infrastructure/http/routes/diagnosis.routes.ts`: `router.get('/ecu-info', controller.ecuInfo)`
- [ ] 6.4 Actualizar `src/infrastructure/http/swagger.ts` con el nuevo endpoint

## 7. RED — UI: useEcuInfo + EcuInfoPanel

- [ ] 7.1 Añadir tests en `apps/ui/tests/unit/lib/api.test.ts`: `api.getEcuInfo(scenarioId)` llama a `GET /api/ecu-info?scenarioId=`
- [ ] 7.2 Añadir tests en `apps/ui/tests/unit/components/useEcuInfo.test.ts`: hook carga ECUs al cambiar `selectedId`, maneja loading/error
- [ ] 7.3 Añadir tests en `apps/ui/tests/unit/components/EcuInfoPanel.test.tsx`: estado vacío, tabla con ECUs, "sin ECUs descubiertas"

## 8. GREEN — Implementar UI

- [ ] 8.1 Modificar `apps/ui/src/components/dashboard/types.ts`: tipo `EcuInfo`
- [ ] 8.2 Modificar `apps/ui/src/lib/api.ts`: `api.getEcuInfo(scenarioId)`
- [ ] 8.3 Crear `apps/ui/src/components/dashboard/useEcuInfo.ts`
- [ ] 8.4 Crear `apps/ui/src/components/dashboard/EcuInfoPanel.tsx`
- [ ] 8.5 Modificar `apps/ui/src/components/dashboard/DashboardPage.tsx`: integrar `EcuInfoPanel`
- [ ] 8.6 Actualizar `apps/ui/tests/unit/components/DashboardPage.test.tsx` y `apps/ui/tests/e2e/dashboard.spec.ts` si aplica

## 9. REFACTOR + Verificación

- [ ] 9.1 Ejecutar `pnpm lint && pnpm format && pnpm test && pnpm build` — todo verde
- [ ] 9.2 Revisar DRY/KISS: sin duplicación entre tool MCP narrativa y endpoint estructurado
- [ ] 9.3 Actualizar `SESION ACTUAL` en `AGENTS.md`
