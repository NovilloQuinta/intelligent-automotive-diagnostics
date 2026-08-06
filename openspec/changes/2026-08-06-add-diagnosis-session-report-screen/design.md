## Context

El pipeline cognitivo (Fase 4) está completo en backend: `ExecuteCognitiveDiagnosisUseCase` + `POST /api/mcp/cognitive-diagnosis` (ver capability archivada `execute-cognitive-diagnosis`), con timeout de 60s y traza de `toolCalls`. El diagnóstico determinista (`ProcessVehicleDiagnosisUseCase` + `POST /api/diagnosis`) es independiente y rápido. Ambos comparten el mismo `scenarioId`/repositorio pero se invocan por separado — no hay ningún concepto de "sesión" que los agrupe en el sistema actual: `DiagnosisSession` (entidad de dominio) y `VehicleRepository.createSession/endSession` existen pero **no se instancian en ningún punto del código** (mismo hallazgo que `EcuInfo`/`VehicleRepository` en `add-ecu-info-screen`).

El cliente API (`apps/ui/src/lib/api.ts`) ya tiene `api.getCognitiveDiagnosis()` y `api.getCapabilities()` — código muerto: ningún componente los invoca, y `getCapabilities()` apunta a `GET /api/mcp/capabilities`, una ruta que no existe en `diagnosis.routes.ts`. Esto sugiere que la intención de una pantalla de diagnóstico cognitivo ya estaba prevista pero nunca se completó del lado del servidor ni de la UI.

## Goals / Non-Goals

**Goals:**
- Consolidar en una vista los 4 tipos de datos de una sesión de diagnóstico: DTCs + freeze frame (determinista), ECUs, diagnóstico determinista, diagnóstico cognitivo.
- Cerrar el hueco `GET /api/mcp/capabilities` que el frontend ya espera.
- Progressive rendering: cada sección se puebla de forma independiente (no bloquear DTCs/severidad determinista, que responden en ms, a la espera del LLM, que puede tardar hasta 60s).
- Degradación elegante cuando no hay `llmClient` configurado (mostrar mensaje, no ocultar el resto del informe).

**Non-Goals:**
- No se persiste el informe ni se crea una entidad `DiagnosisSession` en BD. El informe es una composición en vivo del `scenarioId` activo (mismo modelo stateless que el resto del dashboard). Conectar `VehicleRepository`/`DiagnosisSession` para histórico de sesiones es una evolución futura independiente, fuera de alcance.
- No se añade exportación a PDF/impresión (el "Health Report" de Autel es imprimible) — la vista es solo HTML interactivo en esta iteración.
- No se implementa un endpoint agregado backend (`GET /api/session-report`) que combine las 4 llamadas server-side — ver Decisión 2.
- No se re-implementa lógica de diagnóstico: se reutilizan íntegramente `POST /api/diagnosis`, `POST /api/mcp/cognitive-diagnosis`, y (si ya existen) `GET /api/ecu-info`, `GET /api/freeze-frame`.

## Decisions

### 1. Cerrar el endpoint `GET /api/mcp/capabilities` que faltaba

**Elegido**: Implementar el endpoint (ya referenciado por código frontend muerto) devolviendo `{ cognitiveDiagnosis: boolean }` según `service.hasCognitiveDiagnosis` (nuevo getter en `DiagnosisService`, análogo a `isDirectConnection`, que expone `this.llmClient !== undefined`). No requiere autenticación adicional — mismo middleware que el resto de `/api`.

**Rechazado**: Eliminar `api.getCapabilities()` del frontend por no usarse. El propósito original (probar disponibilidad del LLM antes de mostrar el botón de diagnóstico cognitivo) es exactamente lo que necesita esta pantalla; completar el endpoint es más valioso que borrar código muerto.

### 2. Orquestación client-side (paralela), no endpoint agregado

**Elegido**: `useSessionReport(scenarioId)` dispara en paralelo `api.runDiagnosis()`, `api.getEcuInfo()`, `api.getFreezeFrame()` (una vez conocidos los DTCs del resultado determinista) y, si `capabilities.cognitiveDiagnosis`, `api.getCognitiveDiagnosis()`. Cada llamada tiene su propio estado `loading`/`data`/`error`, permitiendo que el informe muestre DTCs y severidad determinista de inmediato mientras el LLM sigue procesando.

**Rechazado**: `GET /api/session-report?scenarioId=` que internamente llame a los 4 casos de uso y devuelva un único JSON. Forzaría a la UI a esperar el peor caso (60s del LLM) antes de mostrar cualquier dato, empeorando la UX de una pantalla que debería sentirse "viva" (igual que el resto del dashboard, que ya usa streaming/polling para telemetría). Además duplicaría en el backend la orquestación que `DiagnosisService` ya expone por separado.

### 3. Freeze frame del informe: sin `dtc` explícito (el freeze frame del escenario)

**Elegido**: El informe llama a `GET /api/freeze-frame?scenarioId=` sin `dtc` — igual que `ProcessVehicleDiagnosisUseCase` hoy (`repo.getFreezeFrame()` sin argumento), mostrando "el" freeze frame del escenario activo. Si en el futuro un escenario modela múltiples DTCs con freeze frames distintos (fuera de alcance de `add-freeze-frame-screen`), el informe puede iterar por cada DTC del resultado determinista.

**Rechazado**: Requerir selección manual de DTC antes de generar el informe. El objetivo del informe es una vista de una sola pulsación ("Generar informe"), no una exploración interactiva como `FreezeFramePanel` del dashboard principal.

### 4. Dependencia con `add-ecu-info-screen` y `add-freeze-frame-screen`: progressive enhancement, no bloqueo estricto

**Elegido**: `useSessionReport` comprueba en tiempo de ejecución si `GET /api/ecu-info`/`GET /api/freeze-frame` devuelven 404 (ruta no montada, p.ej. si este cambio se implementa antes que los otros dos) y en ese caso omite silenciosamente esas secciones del informe (no muestra error, solo no las renderiza). Esto permite implementar `add-diagnosis-session-report-screen` de forma aislada sin romper si los otros dos cambios aún no están mergeados, aunque el orden recomendado es implementarlos primero para un informe completo desde el primer commit.

**Rechazado**: Hacer el cambio estrictamente bloqueado (no implementable) hasta que los otros dos existan. Añadir un acoplamiento de secuencia rígido entre 3 cambios OpenSpec independientes complica la planificación; la degradación elegante es más robusta y sigue el mismo principio que la degradación por ausencia de `llmClient`.

## Data Model

```typescript
// Composición client-side — no hay un DTO backend nuevo para el informe completo
interface SessionReport {
  scenario: Scenario
  deterministic: DiagnosisResponse            // POST /api/diagnosis (existente)
  ecus: EcuInfo[] | null                      // GET /api/ecu-info (si disponible)
  freezeFrame: FreezeFrame | null             // GET /api/freeze-frame (si disponible)
  cognitive: CognitiveOutput | 'unavailable' | 'loading' | null  // POST /api/mcp/cognitive-diagnosis
}

// GET /api/mcp/capabilities → 200
interface CapabilitiesResponse {
  cognitiveDiagnosis: boolean
}
```

### Flujo de ejecución

```
Usuario pulsa "Generar informe" (vehículo ya seleccionado y diagnosticado, o dispara diagnóstico)
  → useSessionReport(scenarioId)
      ├─ GET /api/mcp/capabilities → { cognitiveDiagnosis }
      ├─ POST /api/diagnosis { scenarioId } ──────────┐ (rápido, ~ms)
      ├─ GET /api/ecu-info?scenarioId=     ────────────┤ en paralelo
      ├─ GET /api/freeze-frame?scenarioId= ────────────┘
      └─ if cognitiveDiagnosis: POST /api/mcp/cognitive-diagnosis { scenarioId } (hasta 60s)
  → SessionReportPanel renderiza cada sección según llega su promesa
```

## UI

`SessionReportPanel` puede vivir como sección expandida del dashboard o como ruta propia `/session-report` (a decidir en implementación, siguiendo el patrón de rutas de TanStack Start ya usado en `apps/ui/src/routes/`). Diseño en secciones apilables: cabecera (vehículo + VIN + fecha), DTCs + severidad determinista, freeze frame, ECUs, diagnóstico cognitivo (narrativa + badges de severidad/confianza + lista de recomendaciones + traza de tools colapsable). Reutiliza estilos y componentes ya existentes (`severityMeta`, `panel` CSS class, `Badge`/`Accordion` de `components/ui/`) en vez de duplicar diseño visual nuevo.
