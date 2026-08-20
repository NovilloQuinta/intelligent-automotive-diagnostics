---
name: clean-architecture
description: Reglas de capa domain/application/infrastructure del proyecto — disciplina estricta de Clean Architecture
---

# Skill: clean-architecture

Load this skill before creating or moving files between layers. Enforces strict Clean Architecture discipline across `domain/`, `application/`, and `infrastructure/`.

The authority for these rules is `docs/adr/001-arquitectura-del-sistema.md`. This file is its operational form; if the two ever disagree, the ADR wins and this file is the one to fix.

---

## Layer rules

### `domain/` — Entities & Business Rules (innermost layer)

**Allowed contents:**
- **Entities** (`domain/entities/`): classes with a mandatory `id: number` in the constructor, `readonly` properties, and typed errors (`User`, `EcuInfo`, `PidDefinition`, `VehicleProfile`)
- **Value objects** (`domain/value-objects/`): immutable classes without identity, public constructor with inline validation and derived getters (`Vin`, `PidCode`, `FreezeFrame`, `DiagnosisResult`)
- **Domain services** (`domain/services/`): pure functions over domain concepts (`pidFormula.ts`)
- **Catalogs** (`domain/catalogs/`): reference data and its lookup (`pidCatalog.ts`, `dtcCatalog.ts`, `ecuAddressCatalog.ts`, `pidObservationCatalog.ts`)
- **Constants and vocabulary** at the root of `domain/`: OBD-II modes and PIDs (`pids.ts`), read-only mode policy (`obdServiceMode.ts`), system names (`systemVocabulary.ts`)

**Forbidden:**
- NO imports from `application/` or `infrastructure/`
- NO framework code (Express, Drizzle, MCP SDK)
- NO I/O: no file system, no HTTP, no DB drivers
- NO side effects

**Naming** — entities and value objects in `PascalCase`, one concept per file. Catalogs, constants and domain services stay in `camelCase`: they are modules of data or functions, not a single named concept.

**Examples (this project):**
```
domain/entities/User.ts                ← OK: entity, mandatory id, UserError
domain/entities/EcuInfo.ts             ← OK: entity
domain/entities/PidDefinition.ts       ← OK: entity
domain/value-objects/Vin.ts            ← OK: value object (validation + VinDecodeError + derived getters)
domain/value-objects/PidCode.ts        ← OK: value object (key getter)
domain/value-objects/DiagnosisResult.ts ← OK: value object (derives severity, no presentation)
domain/services/pidFormula.ts          ← OK: pure functions over PIDs
domain/catalogs/pidCatalog.ts          ← OK: SAE J1979 reference data
```

### `application/` — Ports & Use Cases (middle layer)

**Allowed contents:**
- **Ports** (`application/ports/`): interfaces defining the contracts infrastructure must implement
- **Use cases** (`application/use-cases/`): classes with an `execute()` method and dependencies injected through the constructor. Admin use cases live in `application/use-cases/admin/`
- **DTOs** (`application/dto/`): pure data interfaces, one per file, grouped by area (`auth/`, `admin/`, `diagnosis/`, `llm/`, `knowledge/`, `vector/`, `audit/`, `profile/`, `web-search/`)
- **Supporting modules**: `llm/` (anti-corruption parser), `knowledge/` (confidence scale and mappers), `ecu-catalog/` (resolution against the learned catalog), `obd/` (OBD-II errors and derivations), `prompts/`, `templates/`, `shared/`

**Allowed imports:**
- `domain/**` — YES
- `application/**` — YES
- `infrastructure/*` — **NO** (ports must NOT know implementations)

**Port naming (ADR-001, rule 9)** — repository ports carry no suffix; ports for external services end in `Port`. The suffix is what tells them apart at a glance:

```
application/ports/UserRepository.ts         ← repository: no suffix
application/ports/ObdRepository.ts          ← repository: no suffix
application/ports/VehicleRepository.ts      ← repository: no suffix
application/ports/LlmClientPort.ts          ← external service: Port
application/ports/Elm327TransportPort.ts    ← external service: Port
application/ports/VectorStorePort.ts        ← external service: Port
application/ports/LoggerPort.ts             ← external service: Port
```

**Examples (this project):**
```
application/use-cases/RegisterUserUseCase.ts          ← OK: class with execute(), deps by constructor
application/use-cases/ProcessVehicleDiagnosisUseCase.ts ← OK: imports port, orchestrates
application/use-cases/admin/ListUsersUseCase.ts       ← OK: admin use case
application/dto/auth/RegisterUserInput.ts             ← OK: one DTO per file
```

**Anti-patterns:**
```typescript
// ❌ use case importing infrastructure directly
import { SqliteVehicleRepository } from '@/infrastructure/persistence/sqlite/vehicleRepository.js'

// ❌ orchestration living outside use-cases/ as a loose function
// ❌ a use case without execute(), or with dependencies resolved inside instead of injected
```

### `infrastructure/` — Adapters (outermost layer)

**Allowed contents:**
- Implementations of ports (`implements ObdRepository`, `implements VehicleRepository`)
- Framework code: Express server, controllers, middleware, MCP server
- DB drivers, Drizzle schemas, repositories, vector stores
- Hardware adapters, TCP/serial clients, simulators, parsers

**Allowed imports:** `domain/**`, `application/**`, and other `infrastructure/**` modules.

**Real directories:**
```
infrastructure/
├── composition/     # Composition root — the single wiring point, split by area
├── configuration/   # Zod-validated env vars
├── elm327/          # ELM327 adapter, transport, protocol parsing
├── email/           # Email sender
├── http/            # controllers/, routes/, middleware/, openapi/, server.ts
├── llm/             # Anthropic / OpenAI adapters
├── mcp/             # In-process MCP server and toolkits
├── observability/   # pino logger + SQLite sink
├── persistence/     # sqlite/ (Drizzle), vector/ (LanceDB), mappers/
├── services/        # Application services (auth, diagnosis)
├── simulation/      # OBD-II simulator and scenarios
└── web-search/      # Web search adapter
```

**Controllers call use cases.** `AuthController`, `AdminController` and `ProfileController` are the reference: the controller validates input, calls a use case, maps the result to HTTP. It does not orchestrate.

---

## Directory map (this project)

```
apps/core-api/src/
├── main.ts                          # Entry point — loads config, calls buildApp, listens
│
├── domain/                          # Inner layer: pure business concepts
│   ├── entities/                    #   9 entities, PascalCase, mandatory id
│   ├── value-objects/               #   12 value objects, PascalCase, immutable
│   ├── catalogs/                    #   Reference data + its lookup (camelCase)
│   ├── services/                    #   Pure domain functions
│   └── *.ts                         #   OBD-II constants and vocabulary (camelCase)
│
├── application/                     # Middle layer: ports + use cases
│   ├── ports/                       #   23 contracts (Repository / …Port)
│   ├── use-cases/                   #   Classes with execute(), + admin/
│   ├── dto/                         #   One DTO per file, grouped by area
│   ├── llm/                         #   Anti-corruption parser for LLM output
│   ├── knowledge/                   #   Confidence scale + knowledge mappers
│   ├── ecu-catalog/                 #   ECU definition resolution
│   ├── prompts/                     #   System prompt blocks
│   ├── templates/                   #   Text templates
│   ├── obd/                         #   OBD-II errors and derivations
│   └── shared/                      #   Cross-cutting pure utilities
│
└── infrastructure/                  # Outer layer: concrete adapters
    └── (see the 12 directories above)
```

The **composition root** is `infrastructure/composition/`, not `main.ts`. It is split by area (`auth.ts`, `diagnosis.ts`, `knowledge.ts`, `persistence.ts`, `llm.ts`, `admin.ts`, `email.ts`, `scenarios.ts`) and assembled in `composition.ts`. It is the only place where concrete classes are instantiated and injected into use cases.

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
- **Composition root** instantiates infrastructure adapters and injects them into use cases

---

## Checklist (before commit)

Run before committing to verify layer discipline:

1. `grep -r "from '@/infrastructure" src/application/` — must return **zero** matches
2. `grep -r "from '@/application" src/domain/` — must return **zero** matches
3. No `instanceof` checks in `application/` — use interfaces, not concrete classes
4. No `new Database()`, `new ObdSimulator()`, or framework instantiation in `application/`
5. Run `pnpm lint` — public exports in all 3 layers must have TSDoc (eslint-plugin-jsdoc)
6. Run `pnpm test` — all tests must pass

### Fixing violations

| Violation | Fix |
|---|---|
| Use case imports `better-sqlite3` | Inject the dependency via port interface |
| Use case imports `express` | Extract HTTP concern to controller in `infrastructure/http/` |
| Domain entity imports `drizzle-orm` | Remove the dependency; entities are pure data |
| Port is in `domain/repositories/` | Move to `application/ports/` |
| Controller orchestrates instead of calling a use case | Move the orchestration to `application/use-cases/` |
| New entity or value object in `camelCase` | Rename to `PascalCase` (ADR-001) |
| Port for an external service without `Port` suffix | Rename (ADR-001, rule 9) |
