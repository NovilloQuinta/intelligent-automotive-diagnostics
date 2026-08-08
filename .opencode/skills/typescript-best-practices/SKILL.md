---
name: typescript-best-practices
description: AWS-inspired TypeScript best practices — types, naming, interfaces, utility types, access modifiers, and code quality
license: MIT
---

Load this skill when writing or reviewing TypeScript code. Based on AWS prescriptive guidance.

### Typing

- Never use `any` — always type explicitly. Prefer `unknown` and narrow with type guards
- Use `interface` for object contracts (entities, DTOs, repository contracts); use `type` for unions, intersections, and computed types
- Mark immutable properties with `readonly`:
  ```ts
  interface LiveData {
    readonly rpm: number;
    readonly coolantTemp: number;
  }
  ```
- Extend interfaces (`extends`) instead of duplicating properties:
  ```ts
  interface VehicleDiagnosis {
    dtcCodes: string[];
    severity: 'low' | 'medium' | 'critical';
  }
  interface CognitiveDiagnosis extends VehicleDiagnosis {
    explanation: string;
    recommendedActions: string[];
  }
  ```
- Avoid empty interfaces — they introduce inconsistency with no enforcement
- Use access modifiers: `private` for internal state, `protected` for subclass access, `public` by default

### Naming

| Element | Convention | Example |
|---|---|---|
| Variables / functions / file names | camelCase | `getVehicleData()`, `hexParser.ts` |
| Classes / interfaces / types / enums | PascalCase | `class ObdSimulator`, `interface Vehicle` |
| Global constants (compile-time) | UPPER_SNAKE_CASE | `const MAX_PID_BYTES = 8` |
| Enum members | PascalCase | `Severity.Critical` |

### Language

- Use `const` by default; `let` only when rebinding is required. Never use `var`
- Use destructuring when extracting properties from objects/params:
  ```ts
  const { rpm, coolantTemp, dtcCodes } = liveData;
  ```
- Use utility types instead of writing manual transformations:
  - `Partial<T>` — make all properties optional
  - `Required<T>` — make all properties required
  - `Pick<T, K>` — select specific properties
  - `Omit<T, K>` — exclude specific properties
  - `Readonly<T>` — deep immutability
- Use string enums for clearer logs and debugging:
  ```ts
  enum DtcSeverity {
    Low = 'LOW',
    Medium = 'MEDIUM',
    Critical = 'CRITICAL',
  }
  ```

### Code Quality

- No magic numbers — extract to named constants:
  ```ts
  const MAX_RPM = 8000;        // instead of magic 8000
  const COOLANT_TEMP_MAX = 120; // instead of magic 120
  ```
- Validate all external input — never trust `req.body`, `req.query`, or `req.params` without parsing/validation
- No superfluous comments — prefer self-documenting code with descriptive names
- Explicit error handling — never leave empty `catch` blocks; always log or re-throw:
  ```ts
  try {
    const data = await obdRepository.getRawTelemetry();
    return parseHex(data);
  } catch (error) {
    logger.error('Failed to parse telemetry', error);
    throw new DiagnosisError('Telemetry parsing failed');
  }
  ```

### Tooling

- ESLint for static analysis + Prettier for consistent formatting
- Recommended `package.json` scripts:
  ```json
  {
    "scripts": {
      "lint": "eslint --ext .ts src/ tests/",
      "format": "prettier --check 'src/**/*.ts' 'tests/**/*.ts'",
      "format:fix": "prettier --write 'src/**/*.ts' 'tests/**/*.ts'"
    }
  }
  ```

### Project-specific: Intelligent Automotive Diagnostics

Apply these conventions in the `apps/core-api/` workspace:
- Domain entities (`vehicle.ts`) → `interface` with `readonly` props
- Repository contracts (`obdRepository.interface.ts`) → `interface` with method signatures
- Use cases → named functions returning typed results, no default exports
- Simulator DTC severities → `string enum` (`DtcSeverity`)
- Hex parser constants (SAE J1979 formulas) → `UPPER_SNAKE_CASE`
