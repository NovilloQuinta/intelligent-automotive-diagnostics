## 1. RED — DiagnosisService.getVehicleInfo() + endpoint

- [ ] 1.1 Añadir tests en `tests/unit/infrastructure/services/diagnosisService.test.ts`:
  - `getVehicleInfo(scenarioId)` devuelve `vin`, `make`, `model`, `year`, `engineType` desde `repository.getVehicleInfo()`
  - Incluye `manufacturer`/`region`/`modelYearDecoded` derivados de `new Vin(vin)` cuando el VIN es válido
  - VIN inválido/`FALLBACK_VIN` → `manufacturer`/`region`/`modelYearDecoded` en `null` (sin lanzar error)
  - `scenarioId` inexistente lanza `DiagnosisScenarioNotFoundError`
- [ ] 1.2 Añadir tests en `tests/unit/infrastructure/http/routes/diagnosis.routes.test.ts`:
  - `GET /api/vehicle-info?scenarioId=audi-a3-idle` → 200 con el payload completo
  - `GET /api/vehicle-info?scenarioId=no-existe` → 404
  - Modo TCP directo sin `scenarioId` → 200 con datos del adaptador TCP

## 2. GREEN — Implementar servicio + endpoint

- [ ] 2.1 Modificar `src/infrastructure/services/diagnosisService.ts`: método `getVehicleInfo(scenarioId?)`
- [ ] 2.2 Modificar `src/infrastructure/http/controllers/DiagnosisController.ts`: handler `vehicleInfo` con Zod schema para `req.query`
- [ ] 2.3 Modificar `src/infrastructure/http/routes/diagnosis.routes.ts`: `router.get('/vehicle-info', controller.vehicleInfo)`
- [ ] 2.4 Actualizar `src/infrastructure/http/swagger.ts` con el nuevo endpoint

## 3. RED — useVehicleAutoDetect + useScenarios sin auto-selección

- [ ] 3.1 Añadir tests en `apps/ui/tests/unit/components/useScenarios.test.ts`: `selectedId` permanece `""` tras cargar escenarios (elimina el test de auto-selección actual, si existe, y documenta el nuevo comportamiento)
- [ ] 3.2 Añadir tests en `apps/ui/tests/unit/lib/api.test.ts`: `api.getVehicleInfo(scenarioId)` llama a `GET /api/vehicle-info?scenarioId=`
- [ ] 3.3 Añadir tests en `apps/ui/tests/unit/components/useVehicleAutoDetect.test.ts`:
  - Transiciones `selecting` → `detecting` → `confirming` → `done`
  - Error en `GET /api/vehicle-info` mantiene el wizard en un estado de error recuperable (permite reintentar)

## 4. GREEN — Implementar hook

- [ ] 4.1 Modificar `apps/ui/src/components/dashboard/useScenarios.ts`: eliminar auto-selección de `data[0].id`
- [ ] 4.2 Modificar `apps/ui/src/components/dashboard/types.ts`: tipo `VehicleInfoResponse`
- [ ] 4.3 Modificar `apps/ui/src/lib/api.ts`: `api.getVehicleInfo(scenarioId)`
- [ ] 4.4 Crear `apps/ui/src/components/dashboard/useVehicleAutoDetect.ts`

## 5. RED — VehicleAutoDetectWizard + integración en DashboardPage

- [ ] 5.1 Añadir tests en `apps/ui/tests/unit/components/VehicleAutoDetectWizard.test.tsx`:
  - Paso `selecting`: lista de escenarios, selección dispara `detecting`
  - Paso `detecting`: spinner/estado de carga
  - Paso `confirming`: tarjeta de vehículo con VIN/marca/modelo/año, botón "Entrar a diagnóstico"
  - Confirmar dispara callback `onConfirm(scenarioId)`
- [ ] 5.2 Actualizar tests en `apps/ui/tests/unit/components/DashboardPage.test.tsx`:
  - Sin vehículo confirmado → renderiza el wizard, no `TelemetrySection`
  - Tras confirmar → renderiza el layout de diagnóstico existente
  - Cambiar de vehículo desde `VehicleSelector` reabre el wizard en `detecting`

## 6. GREEN — Implementar wizard + integración

- [ ] 6.1 Crear `apps/ui/src/components/dashboard/VehicleAutoDetectWizard.tsx`
- [ ] 6.2 Modificar `apps/ui/src/components/dashboard/DashboardPage.tsx`: gate de entrada según el estado del wizard
- [ ] 6.3 Modificar `apps/ui/src/components/dashboard/VehicleSelector.tsx`: reabrir wizard en vez de cambiar `selectedId` directamente
- [ ] 6.4 Actualizar `apps/ui/tests/e2e/dashboard.spec.ts` con el flujo completo (login → wizard → confirmar → dashboard)

## 7. REFACTOR + Verificación

- [ ] 7.1 Ejecutar `pnpm lint && pnpm format && pnpm test && pnpm build` — todo verde
- [ ] 7.2 Revisar DRY/KISS: reutilización de `Vin` VO existente, sin reimplementar decodificación
- [ ] 7.3 Actualizar `SESION ACTUAL` en `AGENTS.md`
