## 1. RED — Endpoint GET /api/mcp/capabilities

- [ ] 1.1 Añadir tests en `tests/unit/infrastructure/services/diagnosisService.test.ts`:
  - `hasCognitiveDiagnosis` es `true` cuando el servicio recibe `llmClient`
  - `hasCognitiveDiagnosis` es `false` cuando `llmClient` es `undefined`
- [ ] 1.2 Añadir tests en `tests/unit/infrastructure/http/routes/diagnosis.routes.test.ts`:
  - `GET /api/mcp/capabilities` con `llmClient` → 200 `{ cognitiveDiagnosis: true }`
  - `GET /api/mcp/capabilities` sin `llmClient` → 200 `{ cognitiveDiagnosis: false }`

## 2. GREEN — Implementar capabilities

- [ ] 2.1 Modificar `src/infrastructure/services/diagnosisService.ts`: getter `hasCognitiveDiagnosis`
- [ ] 2.2 Modificar `src/infrastructure/http/controllers/DiagnosisController.ts`: handler `capabilities`
- [ ] 2.3 Modificar `src/infrastructure/http/routes/diagnosis.routes.ts`: `router.get('/mcp/capabilities', controller.capabilities)`
- [ ] 2.4 Actualizar `src/infrastructure/http/swagger.ts` con el nuevo endpoint

## 3. RED — Hook useSessionReport

- [ ] 3.1 Añadir tests en `apps/ui/tests/unit/components/useSessionReport.test.ts`:
  - Dispara `runDiagnosis`, `getEcuInfo`, `getFreezeFrame` y `getCognitiveDiagnosis` (si `cognitiveDiagnosis: true`) en paralelo
  - Datos deterministas disponibles antes de que resuelva la llamada cognitiva (mock con distinto tiempo de resolución)
  - `cognitiveDiagnosis: false` → sección cognitiva marcada como `'unavailable'`, sin llamar a `getCognitiveDiagnosis`
  - `getEcuInfo`/`getFreezeFrame` devuelven 404 → sección correspondiente `null`, sin marcar error global
  - Error real (5xx) en diagnóstico determinista → estado de error visible

## 4. GREEN — Implementar useSessionReport

- [ ] 4.1 Crear `apps/ui/src/components/dashboard/useSessionReport.ts`
- [ ] 4.2 Modificar `apps/ui/src/lib/api.ts` si es necesario (verificar que `getCapabilities()`/`getCognitiveDiagnosis()` existentes cubren el contrato; añadir manejo de 404 distinguible de otros errores en `assertOk`/wrapper específico)

## 5. RED — SessionReportPanel

- [ ] 5.1 Añadir tests en `apps/ui/tests/unit/components/SessionReportPanel.test.tsx`:
  - Renderiza cabecera, DTCs, severidad determinista de inmediato
  - Sección cognitiva en loading mientras la promesa está pendiente
  - Sección cognitiva "no disponible" cuando `cognitiveDiagnosis: false`
  - Traza de `toolCalls` colapsada por defecto, expandible
  - Secciones ECU/freeze frame ausentes cuando sus datos son `null` (404 o sin datos)

## 6. GREEN — Implementar SessionReportPanel + integración

- [ ] 6.1 Crear `apps/ui/src/components/dashboard/SessionReportPanel.tsx`
- [ ] 6.2 Modificar `apps/ui/src/components/dashboard/DashboardPage.tsx` (o `TopBar.tsx`): botón "Generar informe"
- [ ] 6.3 (Si se implementa como ruta propia) Crear `apps/ui/src/routes/session-report.tsx` + test en `apps/ui/tests/unit/routes/`
- [ ] 6.4 Actualizar `apps/ui/tests/e2e/dashboard.spec.ts` con el flujo de generación de informe

## 7. REFACTOR + Verificación

- [ ] 7.1 Ejecutar `pnpm lint && pnpm format && pnpm test && pnpm build` — todo verde
- [ ] 7.2 Revisar DRY/KISS: sin duplicar lógica de orquestación ya existente en `DiagnosisService`
- [ ] 7.3 Confirmar degradación elegante si `add-ecu-info-screen`/`add-freeze-frame-screen` aún no están implementados en este branch
- [ ] 7.4 Actualizar `SESION ACTUAL` en `AGENTS.md`
