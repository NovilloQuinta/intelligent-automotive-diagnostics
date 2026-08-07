## Why

Autel MaxiSys consolida, tras un diagnóstico, un "Health Report" que reúne DTCs, freeze frame y el veredicto en una sola vista imprimible/exportable. Nuestro sistema ya tiene todas las piezas para un informe equivalente — y de mayor valor, porque combina diagnóstico determinista **y** cognitivo: `ProcessVehicleDiagnosisUseCase` (DTCs, freeze frame, severidad determinista) y `ExecuteCognitiveDiagnosisUseCase` (narrativa LLM con tool calling sobre datos OBD-II reales, severidad, confianza, recomendaciones, traza de tools) — pero **nunca se muestran juntos**. Hoy `DashboardPage` solo invoca `POST /api/diagnosis` (determinista); el cliente API ya tiene `api.getCognitiveDiagnosis()` y `api.getCapabilities()` implementados en `apps/ui/src/lib/api.ts`, pero **ningún componente los usa** y el endpoint `GET /api/mcp/capabilities` que `getCapabilities()` invoca **no existe en el servidor** (no hay ruta registrada en `diagnosis.routes.ts`).

Esta es la pantalla de mayor valor de demo del TFM: es la única que expone visualmente el pipeline completo OBD-II → MCP → LLM (ADR 003) junto al diagnóstico determinista de referencia, permitiendo comparar ambos enfoques cara a cara.

## What Changes

- **Implementar `GET /api/mcp/capabilities`**: endpoint que faltaba (ya referenciado por `api.getCapabilities()` en el frontend) — devuelve `{ cognitiveDiagnosis: boolean }` según si el servidor tiene `llmClient` configurado. Sin este endpoint la UI no puede decidir si mostrar la sección cognitiva o degradarla con gracia.
- **Nuevo componente `SessionReportPanel`** (`apps/ui/src/components/dashboard/SessionReportPanel.tsx`) + hook `useSessionReport`: orquesta en paralelo (client-side) las llamadas a `POST /api/diagnosis` (determinista, rápido), `GET /api/ecu-info` (change `add-ecu-info-screen`), `GET /api/freeze-frame` (change `add-freeze-frame-screen`) y `POST /api/mcp/cognitive-diagnosis` (hasta 60s), renderizando cada sección de forma independiente según va llegando — sin bloquear el informe completo a la espera del LLM.
- **Nueva ruta `/session-report`** (o sección dentro del dashboard, a decidir en implementación) que muestra el informe consolidado: cabecera del vehículo, DTCs, freeze frame, ECUs, veredicto determinista, veredicto cognitivo (narrativa + severidad + confianza + recomendaciones + traza de tools invocadas).
- **Botón "Generar informe" en `DashboardPage`** (o `TopBar`) que navega/despliega `SessionReportPanel` para el vehículo actualmente seleccionado.
- Sin cambios en persistencia: el informe es una composición en vivo del `scenarioId` activo, no una entidad persistida (`DiagnosisSession`/`VehicleRepository` siguen sin conectarse — ver `design.md`).

## Capabilities

### New Capabilities
- `diagnosis-session-report-screen`: Informe consolidado de sesión de diagnóstico que combina DTCs, freeze frame, ECUs, diagnóstico determinista y diagnóstico cognitivo LLM en una sola vista, con degradación elegante cuando el LLM no está configurado.

## Dependencies

Este cambio **depende de** que los endpoints estructurados `GET /api/ecu-info` (`add-ecu-info-screen`) y `GET /api/freeze-frame` (`add-freeze-frame-screen`) ya existan — `SessionReportPanel` los consume directamente. Si se implementa antes que esos dos cambios, las secciones de ECU y freeze frame deben omitirse (progressive enhancement) sin bloquear el resto del informe; ver `design.md` Decisión 4.

## Impact

- Modificado: `apps/core-api/src/infrastructure/http/controllers/DiagnosisController.ts`, `routes/diagnosis.routes.ts`, `server.ts` (+`GET /api/mcp/capabilities`)
- Modificado: `apps/core-api/src/infrastructure/services/diagnosisService.ts` (+getter `hasCognitiveDiagnosis`)
- Nuevo: `apps/ui/src/components/dashboard/SessionReportPanel.tsx`, `useSessionReport.ts`
- Modificado: `apps/ui/src/components/dashboard/DashboardPage.tsx` (botón/acceso al informe)
- Nuevo (posible): `apps/ui/src/routes/session-report.tsx` (si se implementa como ruta propia)
- Modificado: `apps/ui/src/lib/api.ts` (verificar/ajustar `getCapabilities()` ya existente)
- Tests unitarios correspondientes en `apps/core-api/tests/unit/` y `apps/ui/tests/unit/`, y actualización de `apps/ui/tests/e2e/dashboard.spec.ts`
