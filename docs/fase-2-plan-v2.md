# Plan Fase 2 v2 — Catálogo auto-expansivo con MCP + SQLite + LanceDB

> Replanteo 2026-07-18. Enfoque: catálogo de PIDs auto-expansivo asistido por LLM vía MCP.
> El sistema aprende con cada vehículo al que se conecta — el LLM infiere PIDs desconocidos
> y los persiste en BD para futuras consultas.

---

## Objetivo

El LLM actúa como mecánico: **él decide qué datos necesita y en qué orden**, usando tools MCP
genéricas. No hay diagnóstico "fijo" — el agente razona.

Además, el catálogo de PIDs **crece orgánicamente**: cuando el sistema se conecta a un vehículo
nuevo, el LLM infiere los PIDs desconocidos (fórmula, nombre, unidad) y los persiste. El sistema
aprende con cada coche.

---

## Arquitectura objetivo

```
main.ts (composition root)
  │
  ├─► VehicleRepository (SQLite/Drizzle)     ←─ CRUD vehículos, ECUs, PIDs
  ├─► PidSearchRepository (LanceDB)          ←─ búsqueda vectorial de PIDs similares
  ├─► Elm327Client (TCP)                     ←─ comunicación con emulador/hardware real
  │
  ├─► ObdRepository (ampliado)
  │     ├─ discoverVehicle()
  │     ├─ scanEcus()
  │     ├─ readPid(mode, pid)
  │     ├─ getUnknownReadings()
  │     └─ getVehicleCatalog()
  │
  ├─► McpServer (6+ tools)
  │     ├─ discover_vehicle
  │     ├─ scan_ecus
  │     ├─ read_pid
  │     ├─ get_unknown_readings
  │     ├─ propose_pid_definition
  │     └─ get_vehicle_catalog
  │
  └─► executeCognitiveDiagnosis (usecase)
        └─► MCP client → LLM (Claude) → tool-calling loop
```

### Flujo de descubrimiento auto-expansivo

```
CONEXIÓN OBD REAL
       │
       ▼
┌──────────────────────────────────────────────┐
│  1. discoverVehicle()                         │
│     Mode 09 → VIN → "Toyota Auris 2014"      │
│     Mode 01 00/20/40/60 → bitmask PIDs       │
│     └─► INSERT INTO vehicles (VIN, make...)   │
│                                              │
│  2. scanEcus()                                │
│     TesterPresent a 7E0, 7E1, 7E2...          │
│     └─► INSERT INTO ecus (ECM, TCU, ABS...)   │
│                                              │
│  3. readPid("22", "0300")                     │
│     └─► ¿Existe en BD?                        │
│           SÍ → fórmula + valor físico         │
│           NO → raw hex → se expone al LLM     │
└──────────────┬───────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────┐
│  LLM (via MCP tools)                          │
│                                              │
│  "Unknown PID 22 0300 on TCU of               │
│   Toyota Auris 2014. Raw: 62 03 00 01 A4..."  │
│                                              │
│  LLM: "I know this. Mode 22 PID 0300 on      │
│  Toyota TCU = odometer.                       │
│  Formula: (A<<16 | B<<8 | C) / 10 km"        │
│                                              │
│  → propose_pid_definition(mode, pid, name,    │
│      formula, unit, confidence)               │
│  → INSERT INTO pid_definitions                │
│  → Next time this PID is already known!       │
└──────────────────────────────────────────────┘
```

---

## MCP tools para el LLM

| Tool | Función |
|---|---|
| `discover_vehicle` | Lee VIN + PIDs soportados, persiste en BD |
| `scan_ecus` | Descubre ECUs presentes en el bus |
| `read_pid(mode, pid)` | Lee PID. Si no está en BD, devuelve raw hex |
| `get_unknown_readings` | Lista lecturas raw sin PID identificado |
| `propose_pid_definition` | LLM registra nuevo PID en el catálogo |
| `get_vehicle_catalog` | Devuelve todos los PIDs conocidos del vehículo |

---

## Esquema de BD (SQLite + Drizzle)

```sql
vehicles(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vin TEXT NOT NULL UNIQUE,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER NOT NULL,
  engine_type TEXT NOT NULL,
  first_seen TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen TEXT NOT NULL DEFAULT (datetime('now'))
)

ecus(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  name TEXT NOT NULL,
  request_addr TEXT NOT NULL,
  response_addr TEXT NOT NULL,
  type TEXT NOT NULL,   -- 'ECM' | 'TCU' | 'ABS' | 'HVAC' | 'OTHER'
  protocol TEXT NOT NULL DEFAULT 'CAN_11_500',
  discovered_at TEXT NOT NULL DEFAULT (datetime('now'))
)

pid_definitions(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER REFERENCES vehicles(id),
  ecu_id INTEGER REFERENCES ecus(id),
  mode TEXT NOT NULL,          -- '01' | '02' | '09' | '22' | '2E' | etc.
  pid_code TEXT NOT NULL,      -- '0C' | '05' | '0300' | etc.
  name TEXT NOT NULL,          -- 'Engine RPM' | 'TCU Odometer'
  description TEXT,
  formula TEXT NOT NULL,       -- '(A*256+B)/4' | 'raw-40' | '(A<<16|B<<8|C)/10'
  unit TEXT,                   -- 'rpm' | '°C' | 'km' | 'km/h'
  min_value REAL,
  max_value REAL,
  confidence REAL NOT NULL DEFAULT 1.0,  -- 0-1 (1.0 = confirmed, <1.0 = LLM guess)
  source TEXT NOT NULL DEFAULT 'manual', -- 'auto' | 'llm_guess' | 'manual'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)

pid_readings(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pid_def_id INTEGER REFERENCES pid_definitions(id),
  session_id TEXT NOT NULL,
  raw_hex TEXT NOT NULL,
  parsed_value REAL,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
)

diagnosis_sessions(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  scenario_id TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT
)
```

---

## Pasos de implementación

### Paso 1 — SQLite + Drizzle + VehicleRepository (DDD + TDD)

| # | Acción | Archivo | ¿Nuevo? |
|---|---|---|---|
| 1a | Instalar `drizzle-orm`, `drizzle-kit`, `better-sqlite3`, `@types/better-sqlite3` | `package.json` | Modificar |
| 1b | Schema Drizzle (5 tablas) | `infrastructure/persistence/sqlite/schema.ts` | Nuevo |
| 1c | Init DB + migraciones | `infrastructure/persistence/sqlite/db.ts` | Nuevo |
| 1d | `drizzle.config.ts` | raíz `apps/core-api/` | Nuevo |
| 1e | Entities: `PidDefinition`, `EcuInfo`, `VehicleProfile` | `domain/entities/` | Nuevo |
| 1f | `VehicleRepository` interface | `domain/repositories/vehicleRepository.interface.ts` | Nuevo |
| 1g | Implementación SQLite | `infrastructure/persistence/sqlite/vehicleRepository.ts` | Nuevo |
| 1h | Tests de repositorio | `tests/unit/infrastructure/persistence/sqlite/` | Nuevo |

### Paso 2 — Refactorizar hexParser → pidParser genérico

| # | Acción | Archivo |
|---|---|---|
| 2a | `PidParser` con método `parse(formula: string, rawHex: string): number` | `infrastructure/obd/protocol/pidParser.ts` |
| 2b | Soporta fórmulas: `(A*256+B)/4`, `raw-40`, `(A<<16|B<<8|C)/10`, etc. | |
| 2c | `hexParser.ts` pasa a ser helper interno que usa `PidParser` | Refactorizar |
| 2d | Tests actualizados | `tests/unit/infrastructure/obd/protocol/pidParser.test.ts` |

### Paso 3 — Ampliar ObdRepository + refactorizar ObdSimulator

| # | Acción | Archivo |
|---|---|---|
| 3a | Nueva interfaz con `readPid()`, `getVehicleInfo()`, `discoverVehicle()`, `scanEcus()` | `domain/repositories/obdRepository.interface.ts` |
| 3b | `ObdSimulator` lee/escribe PIDs vía `VehicleRepository` | `infrastructure/hardware-simulator/obdSimulator.ts` |
| 3c | `ObdSimulatorRepository` implementa métodos nuevos | `infrastructure/hardware-simulator/obdSimulatorRepository.ts` |
| 3d | `SimulationScenario` se amplía con `vehicleInfo` + `pidCatalog` base | `infrastructure/hardware-simulator/simulationScenario.ts` |

### Paso 4 — Capa de protocolo OBD (TCP al emulador)

| # | Acción | Archivo |
|---|---|---|
| 4a | Cliente TCP al ELM327 | `infrastructure/obd/elm327Client.ts` |
| 4b | Decodificador VIN (Mode 09 PID 02) | `infrastructure/obd/protocol/vinDecoder.ts` |
| 4c | Scanner de PIDs (Mode 01 PID 00/20/40/60) | `infrastructure/obd/protocol/pidScanner.ts` |
| 4d | Scanner de ECUs (AT SH + TesterPresent) | `infrastructure/obd/protocol/ecuScanner.ts` |
| 4e | Tests de integración con emulador Docker | `tests/` |

### Paso 5 — Use cases de descubrimiento

| # | Acción | Archivo |
|---|---|---|
| 5a | `discoverVehicle(vinRaw, supportedPids)` | `usecases/discovery/discoverVehicle.ts` |
| 5b | `scanEcus(vehicleId)` | `usecases/discovery/scanEcus.ts` |
| 5c | Tests | `tests/unit/usecases/discovery/` |

### Paso 6 — MCP Server (tools para el LLM)

| # | Acción | Archivo |
|---|---|---|
| 6a | Servidor MCP con `@modelcontextprotocol/sdk` | `infrastructure/mcp/mcpServer.ts` |
| 6b | `createMcpServer(repo, vehicleRepo)` factory | |
| 6c | 6 tools registradas | |
| 6d | Tests con MCP client in-process | `tests/unit/infrastructure/mcp/` |

### Paso 7 — LanceDB (búsqueda vectorial de PIDs)

| # | Acción | Archivo |
|---|---|---|
| 7a | Instalar `@lancedb/lancedb` | `package.json` |
| 7b | Init LanceDB + crear tabla con embeddings | `infrastructure/persistence/vector/lancedb.ts` |
| 7c | `PidSearchRepository` interface + implementación | `domain/repositories/`, `infrastructure/persistence/vector/` |
| 7d | Tests | `tests/unit/infrastructure/persistence/vector/` |

### Paso 8 — Diagnóstico cognitivo (LLM)

| # | Acción | Archivo |
|---|---|---|
| 8a | `executeCognitiveDiagnosis(repo, mcpServer)` | `usecases/agents/executeCognitiveDiagnosis.ts` |
| 8b | `CognitiveDiagnosisResult`, `ToolCallTrace` entities | `domain/entities/` |
| 8c | Tests con mock de Anthropic API | `tests/unit/usecases/agents/` |

### Paso 9 — Integración final

| # | Acción | Archivo |
|---|---|---|
| 9a | `diagnosisController.ts` llama a `executeCognitiveDiagnosis` | Refactorizar |
| 9b | `main.ts` composition root actualizado | Refactorizar |
| 9c | Tests de integración (Express + DB + MCP) | `tests/` |

### Paso 10 — Documentación

| # | Acción |
|---|---|
| 10a | Actualizar ADR-003 con diseño final |
| 10b | Nuevo ADR: 005-catalogo-autoexpansivo.md |
| 10c | Actualizar README |
| 10d | Actualizar `CLAUDE.md` (nuevos directorios, dependencias, scripts DB) |

---

## Orden de ejecución

```
1 ─► 2 ─► 3 ─► 4 ─► 5 ─► 6 ─► 8 ─► 9 ─► 10
                 │
                 └──► 7 (independiente, se puede paralelizar o posponer)
```

---

## Dependencias nuevas

```jsonc
// A añadir a apps/core-api/package.json
"dependencies": {
  "drizzle-orm": "^0.38.0",
  "better-sqlite3": "^11.0.0",
  "@lancedb/lancedb": "^0.14.0"       // paso 7
},
"devDependencies": {
  "drizzle-kit": "^0.30.0",
  "@types/better-sqlite3": "^7.6.0"
}
```

---

## Estado

- **Fase 1**: Completada — 43 tests, Express API, ELM327-emulator en Docker
- **Fase 2a** (Paso 1-5): Base de datos + protocolo OBD
- **Fase 2b** (Paso 6-8): MCP + LanceDB + LLM
- **Fase 2c** (Paso 9-10): Integración + documentación
