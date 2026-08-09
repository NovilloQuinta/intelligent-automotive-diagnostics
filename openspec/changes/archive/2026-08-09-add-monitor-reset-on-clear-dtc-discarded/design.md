## Design

### Enfoque

Un `MonitorLifecycle` por scenarioId en `DiagnosisService` que envuelve el `VehicleStatus` devuelto por el repositorio OBD. No se modifica el emulador ni el adaptador ELM327 — la capa de servicio es la dueña de este estado temporal.

```
clearDtcCodes(scenarioId)
  → lifecycle.reset(scenarioId)
  → repository.clearDtcCodes()

getVehicleStatus(scenarioId)
  → status = repository.getVehicleStatus()
  → return lifecycle.apply(status, scenarioId)
```

### Flujo de estados

```
                  clearDtcCodes()
  [COMPLETADO] ──────────────────→ [PENDIENTE]
                                          │
                     readPid() × N        │
  [PENDIENTE] ←───────────────────────────┘
       │
       │  tras N lecturas del grupo
       ▼
  [COMPLETADO]
```

Reglas del drive cycle simulado:
1. **Common tests** (misfire, fuelSystem, comprehensiveComponent): se completan tras recibir **3 lecturas** de live-data (`getLiveData`). Basta con que el dashboard esté abierto 3 segundos (poll a 1 Hz).
2. **Engine-specific tests**: se completan tras **1 lectura** de cualquier PID vía `readPid` (el diagnóstico ya lee varios PIDs). En la práctica, tras ejecutar un diagnóstico, todos los monitores específicos pasan a completados.

Esto es determinista y predecible: tras 3 segundos de telemetría + 1 diagnóstico, todos los monitores vuelven a verde. Exactamente lo que se espera de un drive cycle acelerado para demo.

### MonitorLifecycle (nueva clase en `domain/`)

```ts
class MonitorLifecycle {
  private state: Map<string, MonitorLifecycleState>

  reset(scenarioId: string): void
  recordPidRead(scenarioId: string): void         // llamado desde getLiveData
  recordDiagnosisRead(scenarioId: string): void   // llamado desde runDiagnosis
  apply(status: VehicleStatus, scenarioId: string): VehicleStatus
}
```

Estado interno por scenarioId:
```ts
type MonitorLifecycleState = {
  reset: boolean
  liveDataReads: number        // 0..3, completa common tests al llegar a 3
  diagnosisReads: number       // 0..1, completa engine-specific al llegar a 1
}
```

### VehicleStatus

Nuevo método de fábrica en `VehicleStatus`:

```ts
static withMonitorsReset(engineType: 'spark' | 'compression'): VehicleStatus
```

Devuelve un `VehicleStatus` con `milOn=false`, `dtcCount=0`, y todos los monitores con `completed=false` (pero `supported=true`). Usa las mismas listas de monitores que `clean()`.

### Ubicación

- `domain/value-objects/monitorLifecycle.ts` — la clase de estado (domain porque la lógica de cuándo un monitor se completa es regla de negocio)
- `domain/value-objects/vehicleStatus.ts` — añadir `withMonitorsReset()`
- `infrastructure/services/diagnosisService.ts` — instanciar y cablear el lifecycle
- `infrastructure/mcp/mcpServer.ts` — nueva tool `get_vehicle_status` expuesta al LLM

### Nueva MCP Tool: get_vehicle_status

El diagnóstico cognitivo necesita saber el estado de los monitores para razonar correctamente. Ejemplo de uso por el LLM:

> "Los monitores de emisiones están todos pendientes — se acaban de borrar los DTCs. Hay que circular el vehículo antes de poder confirmar que las reparaciones han funcionado."

La tool devuelve el mismo `VehicleStatus` que `GET /api/vehicle-status`, aplicando el lifecycle si está activo.

### No se modifica

- Emuladores Python — la lógica está en la capa de servicio, no en el emulador
- Adaptador ELM327 — sigue devolviendo los bytes crudos del emulador/ECU
- Frontend — el VehicleStatusPanel ya maneja `completed: false` con el icono ⚠️
