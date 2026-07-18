# Plan Fase 2 — Diagnóstico Cognitivo con MCP

> Replanteo 2026-07-16. Enfoque: MCP genérico OBD-II para IA agéntica real.

---

## Objetivo

El LLM actúa como mecánico: **él decide qué datos necesita y en qué orden**, usando tools MCP genéricas. No hay diagnóstico "fijo" — el agente razona.

---

## Tools MCP propuestas

| Tool | Firma | Descripción |
|---|---|---|
| `get_vehicle_info` | `() → VehicleInfo` | Tipo de vehículo, PIDs soportados, VIN |
| `get_dtc_codes` | `() → DtcCode[]` | Códigos de fallo con descripción |
| `read_pid` | `(mode: string, pid: string) → LiveData` | Cualquier PID OBD-II (modes 01, 02, 03...) |
| `get_freeze_frame` | `(dtc?: string) → FreezeFrame \| null` | Datos congelados del momento del fallo |

### `read_pid(mode, pid)` — la tool clave

El LLM decide qué PIDs leer según su razonamiento:

```
P0301 detectado → "Necesito RPM, STFT, O2 para aislar"
  → read_pid("01", "0C")  // RPM
  → read_pid("01", "06")  // Short Term Fuel Trim
  → read_pid("01", "14")  // O2 Sensor Bank 1
```

Esto hace que el diagnóstico sea **agéntico**, no determinista.

---

## Flujo de diagnóstico real (ejemplo)

```
POST /api/diagnosis { scenarioId: "audi-a3-idle" }
  │
  ├─► ObdSimulator → genera datos del escenario
  ├─► MCP Server → expone tools al LLM
  │
  ├─► LLM recibe system prompt:
  │     "You are an expert mechanic. Use the available tools to
  │      diagnose the vehicle step by step. Explain your reasoning."
  │
  ├─► LLM ejecuta tools:
  │     get_dtc_codes()              → P0301 (Cylinder 1 Misfire)
  │     read_pid("01", "0C")         → RPM: 750 (normal idle)
  │     read_pid("01", "06")         → STFT: +15% (ECU adding fuel)
  │     read_pid("01", "14")         → O2 Bank 1: rich
  │
  │     LLM razona: "RPM normal, fuel trim positive, O2 rich.
  │       Not an air/fuel issue. Likely ignition. Check plug + coil."
  │
  ├─► executeCognitiveDiagnosis parsea la respuesta final
  │
  ▼
  CognitiveDiagnosisResult {
    diagnosis: "Cylinder 1 misfire — ignition fault suspected...",
    severity: "high",
    recommendations: ["Check spark plug C1", "Inspect ignition coil"],
    confidence: 0.85,
    toolCalls: ["get_dtc_codes", "read_pid(01,0C)", "read_pid(01,06)", "read_pid(01,14)"]
  }
```

---

## Cambios necesarios en código

### 1. `ObdRepository` — ampliar interfaz

```ts
interface ObdRepository {
  getVehicleInfo(): Promise<VehicleInfo>
  readPid(mode: string, pid: string): Promise<number>
  readDtcCodes(): Promise<DtcCode[]>
  getFreezeFrame(dtc?: string): Promise<FreezeFrame | null>
}
```

### 2. `ObdSimulator` — soportar PIDs genéricos

El simulador necesita un mapa de `mode/pid → valor` para que `read_pid` devuelva datos realistas según el escenario.

### 3. `mcpServer.ts` — nuevo (infrastructure/mcp/)

Servidor MCP que expone las 4 tools usando `@modelcontextprotocol/sdk`.

### 4. `executeCognitiveDiagnosis.ts` — nuevo (usecases/agents/)

Orquesta: conecta LLM → MCP server → ejecuta diagnóstico → parsea resultado.

### 5. `diagnosisController.ts` — actualizar

`POST /api/diagnosis` llama a `executeCognitiveDiagnosis` en vez de `processVehicleDiagnosis`.

### 6. `.env` — añadir

```env
ANTHROPIC_API_KEY=sk-ant-...
OBD_MODE=sync
```

---

## Orden de implementación (TDD)

| # | Tarea | Archivo | Depende de |
|---|---|---|---|
| 1 | Ampliar `ObdRepository` interface | `domain/repositories/` | — |
| 2 | Ampliar `ObdSimulator` con mapa de PIDs | `infrastructure/hardware-simulator/` | 1 |
| 3 | Crear `mcpServer.ts` | `infrastructure/mcp/` | 2 |
| 4 | Crear `executeCognitiveDiagnosis.ts` | `usecases/agents/` | 3 |
| 5 | Actualizar `diagnosisController` | `infrastructure/http/controllers/` | 4 |
| 6 | Añadir `ANTHROPIC_API_KEY` a `.env` | — | 4 |

---

## Notas

- Sin `ANTHROPIC_API_KEY` no hay LLM. Pedirla antes de implementar paso 4.
- `processVehicleDiagnosis` actual se mantiene como helper interno (parser), no como endpoint.
- `OBD_MODE=sync` → simulador. `OBD_MODE=elm327` → futuro adaptador real.
