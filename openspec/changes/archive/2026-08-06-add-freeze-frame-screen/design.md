## Context

`FreezeFrame` (VO) y `ObdRepository.getFreezeFrame(dtc?)` ya existen y están integrados en `ProcessVehicleDiagnosisUseCase` (`DiagnosisResult.freezeFrame`) y en la tool MCP `get_freeze_frame`. El problema es de exposición, no de dominio: `DiagnosisService.buildDiagnosisText()` convierte el freeze frame en una línea de texto dentro de `diagnosisText`, y ni `DiagnoseOutput` (backend) ni `DiagnosisResponse` (frontend, `apps/ui/src/components/dashboard/types.ts`) tienen un campo `freezeFrame` estructurado. `DtcPanel` ya renderiza la lista de DTCs pero no es interactivo (no hay `onClick`/selección).

`ObdSimulator.getFreezeFrame(_dtc?: string)` ignora hoy el parámetro `dtc` (prefijo `_` indica que ya está marcado como no usado) — siempre devuelve `scenario.freezeFrame` si existe, sin filtrar por código. Esto es correcto para los escenarios actuales (0 o 1 DTC con freeze frame), pero sería incorrecto si un escenario futuro tuviera 2+ DTCs con freeze frames distintos.

## Goals / Non-Goals

**Goals:**
- Endpoint estructurado `GET /api/freeze-frame?scenarioId=&dtc=` que devuelva `FreezeFrame | null` en JSON.
- `DtcPanel` seleccionable: el usuario elige un DTC de la lista y ve su freeze frame.
- `ObdSimulator.getFreezeFrame(dtc)` filtra correctamente por código cuando se especifica.

**Non-Goals:**
- No se modela freeze frame por-DTC múltiple (varios DTCs, cada uno con su propio freeze frame) — `SimulationScenario.freezeFrame` sigue siendo un único campo opcional. Si se pasa un `dtc` que no coincide con `scenario.freezeFrame.dtcCode`, se devuelve `null` (comportamiento correcto y ya cubierto por el tipo de retorno `FreezeFrame | null`).
- No se toca `Elm327TcpRepository.getFreezeFrame()` — su limitación (usa `dtc ?? 'UNKNOWN'` como fallback de etiqueta, un único PID `0C`) es preexistente y ortogonal a este cambio.
- No se persiste el freeze frame en base de datos — sigue siendo un dato transitorio de la lectura en vivo, igual que hoy.

## Decisions

### 1. Filtrado por `dtc` en el simulador: coincidencia exacta, null si no coincide

**Elegido**: `ObdSimulator.getFreezeFrame(dtc?)`: si `dtc` se especifica y `scenario.freezeFrame.dtcCode !== dtc`, devuelve `null`. Si `dtc` es `undefined`, se mantiene el comportamiento actual (devuelve el freeze frame del escenario si existe). Esto es coherente con el contrato del puerto: *"dtc — Código DTC opcional. Si no se especifica, devuelve el último."*

**Rechazado**: Devolver siempre el freeze frame del escenario sin filtrar (comportamiento actual). Rompería la semántica esperada por la UI: si el usuario selecciona un DTC sin freeze frame asociado, debe ver "sin datos", no los datos de otro código.

### 2. Endpoint dedicado `GET /api/freeze-frame`, no ampliar `/api/diagnosis`

**Elegido**: Nuevo endpoint `GET /api/freeze-frame?scenarioId=&dtc=` en vez de añadir `freezeFrame` al payload de `POST /api/diagnosis`. Refleja la interacción real: el freeze frame se consulta *por DTC seleccionado*, después de ver la lista de códigos, no como parte del resultado de diagnóstico inicial.

**Rechazado**: Añadir `freezeFrame: FreezeFrame | null` a `DiagnoseOutput`/`DiagnosisResponse`. Válido como alternativa más simple (ya se calcula en `ProcessVehicleDiagnosisUseCase`), pero solo cubriría "el último freeze frame", no "el freeze frame del DTC que el usuario seleccionó" cuando haya más de un código. El endpoint dedicado con `dtc` como parámetro es la forma correcta de modelar la interacción de Autel (selección explícita) y es forward-compatible con escenarios multi-DTC futuros.

### 3. Selección de DTC vive en `DashboardPage`, no en `DtcPanel`

**Elegido**: `DashboardPage` mantiene `const [selectedDtc, setSelectedDtc] = useState<string | null>(null)`, lo pasa a `DtcPanel` (`onSelect`) y a `FreezeFramePanel` (`dtc={selectedDtc}`). Mismo patrón que `selectedId` (escenario) ya usado en `DashboardPage`.

**Rechazado**: Estado interno en `DtcPanel` con callback opaco. Rompería el patrón de "lifting state up" ya usado en el resto del dashboard y dificultaría que `FreezeFramePanel` reaccione a la selección.

## Data Model

```typescript
// GET /api/freeze-frame?scenarioId=audi-a3-idle&dtc=P0301 → 200
interface FreezeFrameResponse {
  freezeFrame: { dtcCode: string; pidValues: Record<string, number> } | null
}
```

### Flujo de ejecución

```
Usuario selecciona DTC "P0301" en DtcPanel
  → DashboardPage.selectedDtc = "P0301"
  → FreezeFramePanel dispara GET /api/freeze-frame?scenarioId=<id>&dtc=P0301
      → resolveRepository(scenarioId)
      → repository.getFreezeFrame("P0301")
      → 200 { freezeFrame: { dtcCode: "P0301", pidValues: { "0C": 850, ... } } }
  → FreezeFramePanel renderiza tabla de pidValues
```

## UI

`FreezeFramePanel` puede implementarse como panel lateral que aparece bajo/junto a `DtcPanel` al seleccionar un código, o como diálogo (`components/ui/dialog.tsx`, ya disponible en el design system) anclado a la fila seleccionada — decisión de implementación libre para `writer`, siguiendo el patrón visual existente (`panel` CSS class). Estados: sin selección (oculto o placeholder), cargando, datos (tabla PID → valor), "sin freeze frame para este código" (cuando la API devuelve `null`).
