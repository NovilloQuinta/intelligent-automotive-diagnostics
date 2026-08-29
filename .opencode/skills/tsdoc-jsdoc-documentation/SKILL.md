---
name: tsdoc-jsdoc-documentation
description: TSDoc/JSDoc "Docs As Code" — API documentation, CI validation, and project conventions
license: MIT
---

Load this skill before writing documentation or reviewing TSDoc/JSDoc blocks in the project.

### "Docs As Code" philosophy

Documentation lives in the code, is versioned with it, and is validated in CI. This keeps docs always in sync with the source and makes them a first-class concern of every pull request.

### TSDoc syntax — when to write full TSDoc

Public functions and classes with real logic (not trivial one-liners) in `domain/`, `usecases/`, and `infrastructure/` should have a TSDoc block. Use the canonical form:

```ts
/**
 * One-liner describing what the function/method does.
 * @param paramName — Type, purpose, and any constraints
 * @returns What the caller gets back and under what conditions
 * @throws ErrorType — When and why this error is thrown
 * @example
 * ```ts
 * const result = myFunction(42);
 * console.log(result); // expected output
 * ```
 */
export function myFunction(paramName: number): string { ... }
```

### What NOT to document

Do **not** add TSDoc when the code is self-explanatory. Document only the **"why"**, not the **"what"**. These are **anti-patterns**:

```ts
// ❌ BAD: signature already says everything
/** Sums two numbers */
function sum(a: number, b: number): number { ... }

// ❌ BAD: trivial getter
/** Returns the name */
getName(): string { ... }

// ❌ BAD: redundant — repeats what the code says
/** Creates a new car with the given model and year */
constructor(model: string, year: number) { ... }
```

Good candidates for TSDoc:
- Non-obvious side effects or edge cases
- Business logic that is not immediately clear from the signature
- Error conditions (`@throws`)
- Units or ranges (e.g. "temperature in °C", "RPM 0-8000")

### Conventions by layer

| Layer | Level of detail | Notes |
|---|---|---|
| `domain/entities/` | `/** Brief description */` | Interfaces with `readonly` props only |
| `domain/repositories/` | Full TSDoc | Methods need `@param`, `@returns` |
| `usecases/` | Full TSDoc | `@param`, `@returns`, `@throws` |
| `infrastructure/math-parsers/` | Full TSDoc | **`@throws` mandatory** (ParseError) |
| `infrastructure/hardware-simulator/` | Full TSDoc | `@param`, `@returns` for public methods |
| `infrastructure/http/` | Full TSDoc | `@param`, `@returns`, `@throws` for controllers |
| `infrastructure/mcp/` | Full TSDoc | Tool definitions need usage docs |
| `main.ts`, `scripts/` | **Excluded** | Composition root / tooling — no TSDoc required |

### Real examples from the project

**Before (bare):**
```ts
export function parseRpm(hex: string): number {
  if (hex.length !== 4) {
    throw new ParseError(`RPM requires 4 hex chars, got ${hex.length}`)
  }
  const a = hexToByte(hex.slice(0, 2))
  const b = hexToByte(hex.slice(2, 4))
  return (a * 256 + b) / 4
}
```

**After (with TSDoc):**
```ts
/** Parse 4 hex characters (2 bytes) into RPM per SAE J1979: (A*256+B)/4.
 * Result range: 0–10 000 RPM.
 * @param hex — 4-character hex string (e.g. "0C7B")
 * @returns Engine RPM in revs per minute
 * @throws ParseError — if hex length ≠ 4, chars are invalid, or result out of range
 */
export function parseRpm(hex: string): number { ... }
```

**Use case example:**
```ts
/** Orchestrates telemetry reading and returns a deterministic diagnosis.
 * Reads live data and DTC codes in parallel, computes severity, and builds
 * a human-readable diagnosis text.
 * @param repo — OBD repository bound to a specific vehicle/scenario
 * @returns Structured diagnosis with raw data, parsed values, DTCs, and severity
 */
export async function processVehicleDiagnosis(repo: ObdRepository): Promise<DiagnosisResult> { ... }
```

### CI integration

The project uses `eslint-plugin-jsdoc` integrated into `pnpm lint` to check TSDoc presence:

```bash
pnpm lint
```

The `jsdoc/require-jsdoc` rule (shared config in `eslint.shared.mjs`, root — used by both `core-api` and `ui`) checks public `function`/`class` declarations with a body of 3+ lines. Interfaces, types, consts and one-liners are **not** gated — document them only when they add something the name doesn't already say. Exit code is non-zero on failure.

**What it does NOT check** (intentionally): content quality, tag correctness, or param/return matching. This is a **presence gate**, not a semantic validator. Review accuracy during code review.

### Benefits

| Benefit | How it applies |
|---|---|
| **IDE hover** | VS Code, Vim (coc.nvim), WebStorm show TSDoc on hover — params, returns, errors |
| **Type narrowing** | Well-documented `@param` constraints help prevent misuse across boundaries |
| **AI assistance** | Copilot/Supermaven generate TSDoc from function signatures; consistent TSDoc also helps LLMs generate correct calling code |
| **CI gate** | `pnpm lint` (via eslint-plugin-jsdoc) fails the pipeline if public APIs are undocumented — enforces discipline |
