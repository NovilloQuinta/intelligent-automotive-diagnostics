## Context

Stack: TypeScript ESM strict, Express 5, Clean Architecture, React 19 + TanStack Start, Vitest. El panel "PIDs Leídos" (`PidsTable.tsx`) ya renderiza los 4 PIDs de `DiagnosisResponse.parsedValues` con un veredicto OK/Revisar calculado en `pidCatalog.ts::buildPidRows` usando los umbrales `GAUGE.RPM_DANGER`/`COOLANT_ALARM`/`INTAKE_WARN` de `types.ts` — 100 % client-side, sin cambios de backend en esa parte, y **no debe tocarse** en esta propuesta (feature ya implementada y probada).

En paralelo existe el flujo cognitivo (`ExecuteCognitiveDiagnosisUseCase` → `ExecuteLlmToolCalling` → MCP Server con 6 tools) expuesto en `POST /api/mcp/cognitive-diagnosis`, con `api.getCognitiveDiagnosis()`/`api.getCapabilities()` ya definidos en `apps/ui/src/lib/api.ts` pero sin ningún componente que los invoque. Cada llamada `read_pid` resuelta se registra en `ToolCallTrace = { tool, args, result }` dentro de `ExecuteLlmToolCalling.execute()` (`toolTrace.push({ tool: tc.name, args: tc.args, result })`) — un bucle **genérico**, reutilizado potencialmente por cualquier tool-calling futuro (p. ej. tools LanceDB de ADR 007), sin conocimiento de qué es un PID.

El único catálogo de metadata de PIDs que existe hoy (`PidDefinition` en `domain/entities/pidDefinition.ts`, poblado por `seed-pids.ts`) está pensado para bytes crudos + `Formula` (evaluación de fórmula sobre bytes OBD) y persistencia SQLite indexada por `vehicleId`/`ecuId`. El simulador (`ObdSimulator.readPidValue`) ya devuelve **valores físicos resueltos** (no bytes), y los escenarios se identifican por `scenarioId` de texto sin relación con `vehicleId`. Forzar la reutilización de `PidDefinition` acoplaría el flujo cognitivo/simulado a un modelo pensado para otro caso de uso (adaptador ELM327 hardware).

## Goals / Non-Goals

**Goals:**
- Catálogo de metadata de PIDs propio, ligero y desacoplado de `PidDefinition`/`VehicleRepository`, para los PIDs que el flujo cognitivo/simulado puede leer.
- Enriquecer las lecturas `read_pid` de una sesión cognitiva con nombre/unidad/veredicto ok-review, sin modificar el contrato genérico `ToolCallTrace` ni el bucle `ExecuteLlmToolCalling`.
- Conectar por primera vez `api.getCognitiveDiagnosis()`/`api.getCapabilities()` al dashboard, con disparo automático tras "Iniciar diagnóstico" (confirmado por el usuario), no bloqueante y gateado por capacidades.
- Fusionar en `PidsTable` los 4 PIDs fijos con los PIDs de origen IA sin duplicar códigos, marcando visualmente el origen.

**Non-Goals:**
- No se toca `VehicleRepository`/`SqliteVehicleRepository`/`seed-pids.ts` (real, indexado por `vehicleId`) — queda para el adaptador ELM327 hardware.
- No se conecta `vehicleRepo` a `createMcpServer(...)` en el endpoint cognitivo ni se resucita `get_available_pids` en este flujo — está fuera de alcance; el catálogo nuevo es independiente de esa tool.
- No se implementa streaming real (SSE/WebSocket) de tool-calls progresivos — el endpoint cognitivo devuelve una única respuesta 200 (hasta 60 s); ver Decisión 6.
- No se cambian los umbrales `GAUGE.*` ni la lógica de `buildPidRows` para los 4 PIDs fijos — siguen siendo 100 % client-side, sin regresión sobre la feature ya implementada.
- No se implementa código — solo diseño y tareas.

## Decisions

### 1. Catálogo nuevo y ligero (`domain/pidObservationCatalog.ts`), no reutilizar `PidDefinition`

**Elegido**: Un mapa `PID_OBSERVATION_CATALOG: ReadonlyMap<string, PidObservationDefinition>` (clave `"MODE PID"`, ej. `"01 0C"`) con `interface PidObservationDefinition { name: string; unit?: string; minValue?: number; maxValue?: number }` — sin `id`, `Formula`, `dataBytes`, `confidence` ni `source`, porque el simulador ya entrega valores físicos resueltos, no bytes a decodificar. Vive en `domain/` (dato puro, sin imports de capas superiores), junto a `domain/pids.ts` que ya centraliza los códigos de PID estándar. Para construir/normalizar la clave a partir de los argumentos de la tool (`{ mode, pid }`, potencialmente en minúsculas) se reutiliza el value object `PidCode` ya existente (`new PidCode(mode, pid).key`), evitando duplicar la validación de formato de código PID.

**Rechazado**: Reutilizar `PidDefinition`/`seed-pids.ts`. Acoplaría el flujo cognitivo/simulado (scenarios de texto) a un modelo pensado para `vehicleId` numérico + bytes crudos + persistencia SQLite; añadir un PID al catálogo cognitivo obligaría a rellenar campos irrelevantes (`Formula`, `confidence`, `source`, `dataBytes`) solo para satisfacer el tipo.

### 2. Enriquecimiento fuera del bucle genérico `ExecuteLlmToolCalling`

**Elegido**: Nuevo servicio `application/services/pidObservationEnricher.ts` con `derivePidObservations(toolCalls: readonly ToolCallTrace[]): PidObservation[]`, invocado únicamente desde `ExecuteCognitiveDiagnosisUseCase.execute()` **después** de recibir `{ text, toolCalls }` de `llmClient.sendMessage()`. Filtra `toolCalls` donde `tool === 'read_pid'`, resuelve la clave de catálogo desde `args.mode`/`args.pid` vía `PidCode`, intenta `Number(result)`, y si ambos resuelven, produce una `PidObservation` con veredicto calculado. Entradas sin match de catálogo, con `args` inválidos para `PidCode`, o con `result` no numérico se descartan silenciosamente (enriquecimiento best-effort, no crítico).

**Rechazado**: Enriquecer dentro de `ExecuteLlmToolCalling.execute()` (donde se hace `toolTrace.push(...)`), o añadir un campo `pid?` directamente a `ToolCallTrace`. Ese bucle es el motor genérico de tool-calling del `LlmClientPort`, reutilizable por cualquier conjunto de tools futuro (ADR 007, tools LanceDB); imponerle conocimiento de "qué es un PID" rompería su generalidad y forzaría a todo consumidor de `ToolCallTrace` a cargar con un campo que solo tiene sentido para `read_pid`.

### 3. Campo nuevo `pidObservations` en `ExecuteCognitiveDiagnosisOutput`, no extender `ToolCallTrace`

**Elegido**: `ExecuteCognitiveDiagnosisOutput.pidObservations: readonly PidObservation[]` — adición aditiva y no rompiente al DTO de salida específico del caso de uso cognitivo. `ToolCallTrace` (`{ tool, args, result }`) permanece intacto y sigue sirviendo de traza genérica de auditoría/depuración de la sesión completa (incluye `get_dtc_codes`, `get_freeze_frame`, etc., no solo `read_pid`).

**Rechazado**: Añadir `pid?: PidObservation` opcional a `ToolCallTrace`. Contaminaría un DTO genérico con metadata específica de dominio PID; cualquier otro uso de `ToolCallTrace` (logging, otras tools MCP futuras) heredaría un campo casi siempre `undefined`.

### 4. Veredicto ok/review por PID vía `minValue`/`maxValue` opcionales del catálogo — sin tocar los umbrales `GAUGE.*` del frontend

**Elegido**: `resolvePidObservationStatus(value, def)` en el mismo módulo de catálogo: `'review'` si `def.minValue` está definido y `value < def.minValue`, o si `def.maxValue` está definido y `value > def.maxValue`; `'ok'` en cualquier otro caso (incluido cuando el PID no define umbrales, igual que la velocidad en los 4 PIDs fijos). Los umbrales del catálogo nuevo son "ventana operativa saludable", no límites físicos absolutos — mismo criterio que ya usan `GAUGE.RPM_DANGER`/`COOLANT_ALARM`/`INTAKE_WARN` en el frontend, pero calculados en el backend porque el frontend no tiene visibilidad de qué PIDs descubre la IA.

**Rechazado (explícito, responde al punto abierto del brief)**: Unificar todo el cálculo de estado en el backend, incluidos los 4 PIDs fijos (moviendo `GAUGE.*` al servidor). Introduciría una dependencia de red donde hoy no existe ninguna (el veredicto de los 4 fijos es instantáneo, calculado sobre `parsedValues` ya en memoria) y arriesgaría una regresión en una feature ya implementada y probada (`PidsTable.test.tsx` tiene 9 tests que asumen cálculo 100 % cliente). El backend solo calcula el estado de los PIDs que **él mismo descubre y devuelve**; los 4 fijos siguen siendo responsabilidad exclusiva del cliente.

### 5. Disparo automático no bloqueante en un hook dedicado `useCognitiveDiagnosis`, separado de `useDiagnosis`

**Elegido**: Nuevo hook `useCapabilities()` (llama a `api.getCapabilities()` una vez al montar, `cognitiveDiagnosis: false` por defecto mientras resuelve — mismo fallback seguro que ya implementa `api.getCapabilities()` ante error de red) y `useCognitiveDiagnosis(selectedId)`, que expone `{ pidRows, loading, trigger(query?), reset() }`. `DashboardPage` compone `handleDiagnose = async () => { await runDiagnosis(); if (capabilities.cognitiveDiagnosis) void cognitive.trigger() }` y la pasa como `onDiagnose` a `TelemetrySection` — mismo punto de entrada ya existente ("Iniciar diagnóstico"), sin botón nuevo. `void cognitive.trigger()` no se espera: el resto de la pantalla (severidad, DTCs, texto de diagnóstico, los 4 PIDs fijos) se pinta en cuanto resuelve `runDiagnosis()`, sin esperar la respuesta cognitiva (hasta 60 s).

**Rechazado**: Integrar la llamada cognitiva dentro de `useDiagnosis`. Mezclaría dos ciclos de vida con tiempos y semánticas de error muy distintos (diagnóstico determinista ~ms/timeout 10 s vs. cognitivo hasta 60 s, best-effort) en un único hook, complicando sus tests existentes (`useDiagnosis.test.ts`) y acoplando una feature opcional/gateada a una siempre activa.

### 6. Fusión en una sola tanda — sin transporte de streaming

**Elegido**: `api.getCognitiveDiagnosis()` es una única llamada HTTP no incremental; "añadir después, sin bloquear, las filas que la IA vaya descubriendo" se traduce en: los 4 PIDs fijos aparecen al instante (ya ocurre hoy), y las filas de origen IA aparecen **en un solo lote** cuando la promesa de `getCognitiveDiagnosis()` resuelve (potencialmente hasta 60 s después), con un indicador de carga secundario en `PidsTable` mientras tanto (p. ej. fila "Buscando PIDs adicionales…" con spinner), sin bloquear el resto del dashboard. No es streaming real por-tool-call.

**Rechazado**: Implementar un transporte de streaming (SSE/WebSocket) sobre `ExecuteLlmToolCalling` para emitir cada `ToolCallTrace` en cuanto se resuelve. Sería la única forma de lograr una fusión verdaderamente progresiva, pero es un cambio de infraestructura desproporcionado para esta iteración (afecta al puerto `LlmClientPort`, al MCP Server y al cliente HTTP); queda anotado como posible extensión futura, no como parte de este cambio.

### 7. Fallos del diagnóstico cognitivo son silenciosos/no bloqueantes

**Elegido**: Si `getCognitiveDiagnosis()` falla (timeout, 500, red) o `cognitiveDiagnosis` es `false`, `PidsTable` simplemente no añade filas de IA — sin `toast.error` (reservado a fallos del diagnóstico principal en `useDiagnosis`). A lo sumo un texto discreto ("Sin PIDs adicionales de IA") reemplaza el indicador de carga.

**Rechazado**: Mostrar un toast de error equivalente al de `useDiagnosis`. La IA es una capa de enriquecimiento opcional sobre un diagnóstico ya completo y útil sin ella; un error prominente daría la falsa impresión de que el diagnóstico principal falló.

### 8. Deduplicación de códigos fijos vs. IA en el frontend, no en el backend

**Elegido**: El backend puede legítimamente devolver una `PidObservation` para un código ya fijo (nada impide que el LLM llame `read_pid(01, 0C)` durante su razonamiento). `pidCatalog.ts` exporta `FIXED_PID_CODES = new Set(['01 0C', '01 05', '01 0D', '01 0F'])` y `mergePidRows(fixedRows, aiRows)` descarta cualquier `aiRow` cuyo código esté en ese set antes de anexarlo, deduplicando por código (última lectura gana si el LLM repite una llamada).

**Rechazado**: Filtrar en el backend (el enricher omite los 4 códigos fijos). Acoplaría el catálogo de dominio del backend al conocimiento de "qué PIDs ya muestra esta pantalla concreta del frontend" — una decisión de presentación, no de dominio.

## Data Model

```typescript
// domain/pidObservationCatalog.ts
interface PidObservationDefinition {
  readonly name: string
  readonly unit?: string
  readonly minValue?: number
  readonly maxValue?: number
}
// Claves: "01 0C" (RPM), "01 05" (coolant), "01 0D" (speed), "01 0F" (intake temp),
//         "01 11" (throttle position), "01 04" (engine load), "01 42" (control module voltage)

// application/dto/PidObservation.ts
interface PidObservation {
  readonly code: string        // "01 11" — formato PidCode.key
  readonly name: string
  readonly unit?: string
  readonly value: number
  readonly status: 'ok' | 'review'
}

// application/dto/ExecuteCognitiveDiagnosisOutput.ts (extendido)
interface ExecuteCognitiveDiagnosisOutput {
  diagnosis: string
  severity: Severity
  confidence: number
  recommendations: string[]
  toolCalls: readonly ToolCallTrace[]   // sin cambios
  pidObservations: readonly PidObservation[]   // NUEVO
}
```

### Catálogo — valores propuestos (ilustrativos, ajustables por `writer`)

| Código  | Nombre                            | Unidad | minValue | maxValue |
|---------|------------------------------------|--------|----------|----------|
| `01 0C` | Régimen del motor                  | rpm    | —        | 6500     |
| `01 05` | Temperatura del refrigerante       | °C     | —        | 100      |
| `01 0D` | Velocidad del vehículo             | km/h   | —        | —        |
| `01 0F` | Temperatura del aire de admisión   | °C     | —        | 80       |
| `01 11` | Posición del acelerador            | %      | —        | 90       |
| `01 04` | Carga calculada del motor          | %      | —        | 90       |
| `01 42` | Voltaje del módulo de control      | V      | 11.5     | 15.5     |

### `pidValues` propuestos para `seedScenarios.ts` (ilustrativos)

| Escenario       | `01 11` | `01 04` | `01 42` | Resultado esperado                          |
|-----------------|---------|---------|---------|----------------------------------------------|
| `audi-a3-idle`  | 14      | 18      | 14.2    | Los 3 → `ok`                                  |
| `kawa-z900`     | 52      | 58      | 10.9    | `01 42` → `review` (voltaje bajo, `< 11.5`)   |

El caso `kawa-z900` demuestra el valor del enriquecimiento: un fallo de carga (batería/alternador) que **no** es visible en los 4 PIDs fijos actuales.

### Flujo de ejecución

```
Usuario pulsa "Iniciar diagnóstico"
  → runDiagnosis()  (ya existe, sin cambios) → result con los 4 PIDs fijos → pintura inmediata
  → si capabilities.cognitiveDiagnosis:
      void cognitive.trigger()  (no bloqueante)
        → POST /api/mcp/cognitive-diagnosis { scenarioId }
          → ExecuteCognitiveDiagnosisUseCase.execute()
              ├─ llmClient.sendMessage(...) → { text, toolCalls }   (sin cambios)
              ├─ derivePidObservations(toolCalls)                  (NUEVO)
              │     ├─ filtra tool === 'read_pid'
              │     ├─ key = new PidCode(args.mode, args.pid).key
              │     ├─ def = PID_OBSERVATION_CATALOG.get(key)
              │     ├─ value = Number(result); descarta si NaN o !def
              │     └─ status = resolvePidObservationStatus(value, def)
              └─ return { ...output, pidObservations }
        ← 200 { ..., pidObservations }
  → PidsTable: mergePidRows(fixedRows, pidObservationsAsRows) → tabla fusionada, filas IA marcadas
```

## UI

`PidsTable` recibe dos props nuevas: `aiRows: PidRow[] | null` (mapeadas desde `pidObservations` por `useCognitiveDiagnosis`, con `source: 'ai'`) y `aiLoading: boolean`. Los 4 PIDs fijos (`source: 'fixed'`) se pintan igual que hoy; tras ellos, si `aiLoading` es `true` se añade una fila de carga discreta, y cuando resuelve, las filas de `mergePidRows(fixedRows, aiRows)` se anexan con un badge/indicador visual distinto (p. ej. icono o etiqueta "IA" junto al código) — decisión visual libre para `writer`, siguiendo el patrón ya existente de `pidStatusMeta` (color/icono/label por estado).
