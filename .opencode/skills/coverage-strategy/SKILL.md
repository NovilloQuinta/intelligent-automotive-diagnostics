---
name: coverage-strategy
description: Honest 3-tier coverage strategy — Core (100%), Features (>=80% per-file), Infrastructure (0% excluded) — with antipatterns and actionable metrics
license: MIT
---

Coverage strategy for TypeScript that prioritizes business logic and avoids "coverage inflation". Built on the principle that TypeScript, ESLint, and Prettier already validate infrastructure (types, formatting, interfaces), and tests should focus on what can fail at runtime.

## 3-tier strategy

| Tier | Threshold | What's included | Validation |
|---|---|---|---|
| **Core** | 100% | Critical business logic: algorithms, financial operations, critical path | Native vitest per-file thresholds (100% S/B/F/L) |
| **Features** | >=80% (per-file) | Visible functionality: parsers, services, repositories, MCP tools | `perFile: true` in vitest (80% stmts/lines, 90% funcs, 60% branches) |
| **Infrastructure** | 0% (excluded) | Interfaces, constants, seed data, DB schema, config, delegation adapters | Excluded from coverage |

### Why infrastructure = 0%

TypeScript validates types and interfaces at compile time. ESLint + Prettier validate formatting. Testing `export interface Foo { ... }` or `export const CONSTANTS = [...]` is waste: if it compiles, it works. Coverage should measure business logic, not plumbing.

## Antipatterns

| Antipattern | Symptom | Fix |
|---|---|---|
| **Coverage Inflation** | Tests that only instantiate objects to raise % | Don't test constructors, getters, setters |
| **Mock Everything** | `vi.mock()` on pure functions or domain entities | Mock only at infrastructure boundaries (HTTP, DB, filesystem) |
| **Assertion-less tests** | `it('works', () => { new Foo() })` without `expect()` | Every test must have at least one `expect` |
| **Single global threshold** | 85% global that mixes Core with Infra | Use `perFile: true` + exclusions by category |

## Actionable metrics (supplementary)

Beyond coverage, monitor:

1. **Cyclomatic complexity**: how many functions exceed the limit of 5
2. **Test success rate**: `vitest run` must always be 100%
3. **Build errors**: `tsc --noEmit` must be 0
4. **Vulnerabilities**: `pnpm audit` must return 0
5. **TSDoc coverage**: `pnpm lint` — all public exports documented (eslint-plugin-jsdoc)

## Vitest configuration

```ts
// vitest.config.ts — thresholds for Features + Core 100%
coverage: {
  provider: 'v8',
  include: ['src/**/*.ts'],
  exclude: [
    // Infrastructure (0% by design)
    'src/main.ts',
    'src/domain/**',
    '**/*.interface.ts',
    '**/simulationScenario.ts',
    '**/seed-pids.ts',
    '**/db.ts',
    '**/schema.ts',
    '**/swagger.ts',
    '**/diagnosisController.ts',
    '**/obdSimulatorRepository.ts',
    '**/server.ts',
    '**/auditLogger.ts',
    '**/rateLimiter.ts',
  ],
  thresholds: {
    statements: 80,
    branches: 60,
    functions: 90,
    lines: 80,
    perFile: true,  // Each individual file must meet these thresholds
    'src/application/diagnostics/processVehicleDiagnosis.ts': {
      statements: 100,
      branches: 100,
      functions: 100,
      lines: 100,
    },
  },
},
```

## Core 100% — Native vitest thresholds

Core files use per-file threshold overrides in `vitest.config.ts`:

```ts
thresholds: {
  // ... global thresholds ...
  'src/application/diagnostics/processVehicleDiagnosis.ts': {
    statements: 100,
    branches: 100,
    functions: 100,
    lines: 100,
  },
},
```

Vitest itself fails (exit code 1) if any Core file drops below 100%. No separate CI script needed.

## Project mapping

| File | Tier | Threshold | Coverage |
|---|---|---|---|
| `application/diagnostics/processVehicleDiagnosis.ts` | Core | 100% | 100% |
| `infrastructure/obd/protocol/pidParser.ts` | Feature | 80% | 97.84% |
| `infrastructure/obd/protocol/vinDecoder.ts` | Feature | 80% | 95.65% |
| `infrastructure/mcp/mcpServer.ts` | Feature | 80% | 100% |
| `infrastructure/persistence/sqlite/vehicleRepository.ts` | Feature | 80% | 99.5% |
| `infrastructure/hardware-simulator/obdSimulator.ts` | Feature | 80% | >=80% |
| `application/ports/*.interface.ts` | Infra | Excluded | - |
| `infrastructure/http/server.ts` | Infra | Excluded | - |
| `infrastructure/http/swagger.ts` | Infra | Excluded | - |
| `infrastructure/http/controllers/diagnosisController.ts` | Infra | Excluded | - |
| `infrastructure/hardware-simulator/obdSimulatorRepository.ts` | Infra | Excluded | - |
| `infrastructure/persistence/sqlite/schema.ts` | Infra | Excluded | - |
| `infrastructure/persistence/sqlite/db.ts` | Infra | Excluded | - |
| `infrastructure/persistence/sqlite/seed-pids.ts` | Infra | Excluded | - |

## CI checks

```bash
pnpm test:coverage    # Features >=80% per-file + Core 100% (native vitest thresholds)
pnpm lint             # ESLint + TSDoc on all exports (eslint-plugin-jsdoc)
pnpm format           # Prettier
pnpm build            # tsc --noEmit
pnpm audit            # 0 vulnerabilities
```
