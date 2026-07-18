# Skill: clean-architecture

Load this skill before creating or moving files between layers. Enforces strict Clean Architecture discipline across `domain/`, `application/`, and `infrastructure/`.

---

## Layer rules

### `domain/` — Entities & Business Rules (innermost layer)

**Allowed contents:**
- Pure entity interfaces with `readonly` properties (`LiveData`, `VehicleProfile`, `EcuInfo`, `PidDefinition`, `DtcCode`, `DiagnosisResult`)
- Value objects (plain data structures, no behavior)
- Type unions, enums, constants that represent business concepts

**Forbidden:**
- NO imports from `application/` or `infrastructure/`
- NO framework code (Express, Drizzle, MCP SDK)
- NO I/O: no file system, no HTTP, no DB drivers
- NO side effects

**Examples (this project):**
```
domain/entities/liveData.ts       ← OK: pure interface
domain/entities/pidDefinition.ts  ← OK: pure interface
domain/entities/ecuInfo.ts        ← OK: pure interface
domain/entities/vehicleProfile.ts ← OK: pure interface
```

### `application/` — Ports & Use Cases (middle layer)

**Allowed contents:**
- **Ports** (`application/ports/`): interfaces that define contracts the infrastructure must implement
- **Use cases** (`application/diagnosis/`, `application/discovery/`, `application/agents/`, `application/simulation/`): orchestration logic

**Allowed imports:**
- `domain/entities/*` — YES (reads entity types)
- `application/ports/*` — YES (ports reference other ports)
- `infrastructure/*` — **NO** (ports must NOT know implementations)

**Examples (this project):**
```
application/ports/obdRepository.interface.ts       ← OK: pure interface, imports domain types
application/ports/vehicleRepository.interface.ts   ← OK: pure interface, imports domain types
application/diagnosis/processVehicleDiagnosis.ts   ← OK: imports port, orchestrates
application/discovery/discoverVehicle.ts            ← OK: imports port, orchestrates
```

**Anti-patterns:**
```typescript
// ❌ use case importing infrastructure directly
import { SqliteVehicleRepository } from '@/infrastructure/persistence/sqlite/vehicleRepository.js'

// ❌ port importing another port from infrastructure
import { Elm327Client } from '@/infrastructure/obd/elm327Client.js'
```

### `infrastructure/` — Adapters (outermost layer)

**Allowed contents:**
- Implementations of ports (`implements ObdRepository`, `implements VehicleRepository`)
- Framework code (Express server, controllers, MCP server)
- DB drivers, SQL schemas, repositories
- Hardware simulators, TCP clients, parsers

**Allowed imports:**
- `domain/entities/*` — YES
- `application/ports/*` — YES (to implement them)
- `application/diagnosis/*` — YES (controllers call use cases)
- Other `infrastructure/*` modules — YES (adapters can depend on each other)

**Examples (this project):**
```
infrastructure/persistence/sqlite/vehicleRepository.ts  ← OK: implements VehicleRepository port
infrastructure/hardware-simulator/obdSimulatorRepository.ts ← OK: implements ObdRepository port
infrastructure/http/controllers/diagnosisController.ts   ← OK: calls use cases
infrastructure/mcp/mcpServer.ts                          ← OK: calls ports + use cases
```

---

## Directory map (this project)

```
apps/core-api/src/
├── domain/                          # Capa interna: entidades puras
│   └── entities/
│       ├── vehicleProfile.ts        # VehicleProfile, DiagnosisSession
│       ├── ecuInfo.ts               # EcuInfo
│       ├── pidDefinition.ts         # PidDefinition, PidReading
│       ├── vehicleInfo.ts           # VehicleInfo (legacy)
│       ├── liveData.ts              # LiveData
│       ├── dtcCode.ts               # DtcCode
│       └── diagnosisResult.ts       # DiagnosisResult
│
├── application/                     # Capa intermedia: puertos + casos de uso
│   ├── ports/
│   │   ├── obdRepository.interface.ts
│   │   └── vehicleRepository.interface.ts
│   ├── diagnosis/
│   │   └── processVehicleDiagnosis.ts
│   ├── discovery/                   # discoverVehicle, scanEcus (Fase 2a)
│   ├── agents/                      # executeCognitiveDiagnosis (Fase 2b)
│   └── simulation/                  # switchSimulationScenario (Fase 3)
│
└── infrastructure/                  # Capa externa: adaptadores concretos
    ├── hardware-simulator/
    ├── math-parsers/
    ├── mcp/
    ├── obd/
    ├── persistence/
    │   ├── sqlite/
    │   └── vector/
    └── http/
        ├── controllers/
        └── server.ts
```

---

## Dependency direction (inviolable)

```
domain ← application ← infrastructure
   ↑          ↑             ↑
   └── imports flow this way ──┘
```

- `domain/` imports NOTHING from outside itself
- `application/` imports `domain/` but NOT `infrastructure/`
- `infrastructure/` imports both `domain/` and `application/`
- **Composition root** (`main.ts`) instantiates infrastructure adapters and injects them into use cases

---

## Checklist (before commit)

Run before committing to verify layer discipline:

1. `grep -r "from '@/infrastructure" src/application/` — must return **zero** matches
2. `grep -r "from '@/application" src/domain/` — must return **zero** matches
3. No `instanceof` checks in `application/` — use interfaces, not concrete classes
4. No `new Database()`, `new ObdSimulator()`, or framework instantiation in `application/`
5. Run `pnpm lint:docs` — public exports in all 3 layers must have TSDoc
6. Run `pnpm test` — all tests must pass

### Fixing violations

| Violation | Fix |
|---|---|
| Use case imports `better-sqlite3` | Inject the dependency via port interface |
| Use case imports `express` | Extract HTTP concern to controller in `infrastructure/http/` |
| Domain entity imports `drizzle-orm` | Remove the dependency; entities are pure data |
| Port is in `domain/repositories/` | Move to `application/ports/` |
