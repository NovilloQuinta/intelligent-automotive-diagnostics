---
name: tdd-workflow
description: Red-Green-Refactor TDD cycle — test conventions, mock boundaries, file structure, and commit discipline
license: MIT
---

Load this skill before writing tests or starting a Red-Green-Refactor cycle.

### Workflow

Each development cycle follows three strict phases:

1. **Red** — Write a failing test first. Define the expected behavior before any implementation:
   ```ts
   // hexParser.test.ts
   import { describe, it, expect } from 'vitest';
   import { parseRpm } from './hexParser.js';

   describe('HexParser', () => {
     it('should calculate RPM correctly from HEX frame', () => {
       const result = parseRpm([0x0C, 0x7B]);
       expect(result).toBe(1975); // fails — no implementation yet
     });
   });
   ```
2. **Green** — Write the **minimum** amount of code to make the test pass. No over-engineering, no premature abstractions:
   ```ts
   export function parseRpm(bytes: number[]): number {
     return ((bytes[0] * 256) + bytes[1]) / 4;
   }
   ```
3. **Refactor** — Improve readability, extract constants, rename variables, remove duplication. All tests must stay green throughout.

### File layout

- Tests mirror `src/` structure under `tests/unit/`:
  ```
  src/infrastructure/math-parsers/hexParser.ts
  → tests/unit/infrastructure/math-parsers/hexParser.test.ts

  src/usecases/diagnostics/processVehicleDiagnosis.ts
  → tests/unit/usecases/diagnostics/processVehicleDiagnosis.test.ts
  ```
- Global test config lives in `tests/setup.ts` (Vitest hooks, mocks, environment)

### Naming conventions

- Top-level block: `describe('ModuleName')` — matches the module under test
- Test cases: `it('should ... when ...')` in **English**, descriptive but concise:
  - `it('should throw when RPM exceeds max value')`
  - `it('should return proper DTC codes for Audi A3 scenario')`
  - `it('should parse coolant temperature correctly')`
- One `*.test.ts` file per module; one `describe` per class/function

### Mock boundaries

- Mock **only** at infrastructure boundaries: OBD simulator, HTTP server, file system
- **Never** mock domain entities or pure functions (parsers, validators, converters)
- Use Vitest `vi.mock()` for infrastructure; pass real implementations for domain logic:
  ```ts
  import { describe, it, expect, vi } from 'vitest';

  // Mock the infrastructure boundary
  vi.mock('../../infrastructure/hardware-simulator/obdSimulator.js', () => ({
    ObdSimulator: vi.fn().mockImplementation(() => ({
      getRawTelemetry: vi.fn().mockReturnValue(new Uint8Array([0x0C, 0x7B])),
    })),
  }));
  ```

### Commit discipline

- Run full suite before every commit:
  ```bash
  pnpm test
  ```
- Keep commits atomic: one Red-Green-Refactor cycle per commit
- When a cycle produces too many changes, commit after Green and again after Refactor — never combine Red (failing) with Green
- Use conventional commits: `test(parser): add RPM parsing test` (Red), `feat(parser): implement RPM parsing` (Green), `refactor(parser): extract SAE J1979 constants` (Refactor)

### Vitest configuration (recommended)

```ts
// tests/setup.ts
import { beforeAll, afterAll } from 'vitest';

beforeAll(() => {
  // Global setup: env vars, DB connections, etc.
});

afterAll(() => {
  // Global teardown
});
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
  },
});
```
