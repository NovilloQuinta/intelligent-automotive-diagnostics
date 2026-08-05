# Tasks — dynamic-pid-formulas

TDD estricto: RED → GREEN → REFACTOR. Rama: `feat/dynamic-pid-formulas`. Baseline: 483 tests verdes (38 ficheros). Cada paso deja la suite compilable y verde salvo el RED inmediato.

## 0. RED → GREEN — Migrar VAG Mode 22 DIDs a seed-pids.ts

- [ ] 0.1 RED: Nuevo test `VAG_AUDI_MODE_22_PIDS coverage` en tests de seed (o en `pidFormulas.test.ts`):
  - `VAG_AUDI_MODE_22_PIDS` tiene 16 entradas
  - DID 1130 con formula `(A*256+B)/4`, dataBytes 2, unit `rpm`
  - DID F430 con formula `A`, dataBytes 1, unit `°C`
  - Todos los pidCode tienen mode `22`
  - `ALL_SEED_PIDS` incluye `VAG_AUDI_MODE_22_PIDS` y total = 37
- [ ] 0.2 GREEN: Añadir `VAG_AUDI_MODE_22_PIDS: PidDefinition[]` en `seed-pids.ts` con los 16 DIDs mapeados desde `VAG_MODE_22_FORMULAS` actual, usando el formato `PidDefinition`:
  - Mapear cada DID: `1130` → Engine Speed, `115C` → Charge Air Pressure Actual, `115E` → Charge Air Pressure Specified, `F430` → Coolant Temperature, `F432` → Intake Air Temperature, `F477` → Fuel Rail Pressure Actual, `F47D` → Fuel Rail Pressure Specified, `1035` → EGR Duty Cycle, `1250` → Engine Torque, `1132` → Injection Quantity, `1184` → Intake Air Mass, `1410` → DPF Soot Mass, `140E` → DPF Differential Pressure, `F449` → Accelerator Pedal Position, `1462` → Battery Voltage, `F40D` → Vehicle Speed
  - Cada entrada: `pidCode: new PidCode('22', did)`, resto de campos con valores del hardcodeo actual
  - Añadir `...VAG_AUDI_MODE_22_PIDS` a `ALL_SEED_PIDS`
- [ ] 0.3 `pnpm test` — test de cobertura verde

## 1. RED — Tests del nuevo pidFormulas.ts (sin hardcodeo)

- [ ] 1.1 Reescribir `tests/unit/infrastructure/elm327/pidFormulas.test.ts`:
  - **Eliminar** import de `STANDARD_MODE_01_FORMULAS` y el test `should have entries for all 16 standard Mode 01 PIDs`
  - **Nuevo test**: `createPidFormulaCatalog([])` produce catálogo vacío — `get` devuelve undefined, `apply` usa fallback big-endian
  - **Nuevo test**: `createPidFormulaCatalog(entries)` con entries conocidas — `get('01', '0C')` y `apply('01', '0C', [0x0C, 0x80])` → 800
  - **Nuevo test**: `createPidFormulaCatalog(entries)` con entry Mode 22 — `get('22', '1130')` y `apply('22', '1130', [0x0C, 0x80])` → 800
  - **Nuevo test**: `pidDefinitionsToFormulaEntries()` convierte array de `{ pidCode: { key }, formula, dataBytes }` → entries; filtra fórmula vacía; 37 definiciones → 36 entries (VIN Mode 09 excluido)
  - **Conservar** tests de fallback big-endian y coolant temp (usando catálogo construido con entries)
- [ ] 1.2 `pnpm test -- tests/unit/infrastructure/elm327/pidFormulas` — RED esperado: `createPidFormulaCatalog()` sin argumentos no compila (firma cambiada)

## 2. GREEN — Refactorizar pidFormulas.ts

- [ ] 2.1 Reescribir `apps/core-api/src/infrastructure/elm327/pidFormulas.ts`:
  - **Eliminar** constantes `STANDARD_MODE_01_FORMULAS` y `VAG_MODE_22_FORMULAS`
  - **Eliminar** import de `STANDARD_MODE_01_PIDS` de `seed-pids.ts`
  - **Cambiar firma**: `createPidFormulaCatalog(entries: Iterable<readonly [string, PidFormulaEntry]>): PidFormulaCatalog`
  - **Añadir**: `pidDefinitionsToFormulaEntries(definitions): Array<readonly [string, PidFormulaEntry]>` — convierte structural type `{ pidCode: { key }, formula, dataBytes }` a entries, filtra `formula === ''`
  - **Conservar**: `PidFormulaEntry`, `PidFormulaCatalog` (interfaces), lógica de `get()`/`apply()`, `evaluatePid`, `bigEndian` fallback
  - TSDoc en todos los exports públicos
- [ ] 2.2 `pnpm test -- tests/unit/infrastructure/elm327/pidFormulas` — GREEN: tests del paso 1 pasan

## 3. UPDATE — Adapter ELM327 inyecta seed data

- [ ] 3.1 Modificar `apps/core-api/src/infrastructure/elm327/elm327Adapter.ts`:
  - Añadir import: `import { ALL_SEED_PIDS } from '../persistence/sqlite/seed-pids.js'`
  - Cambiar import de pidFormulas: `import { createPidFormulaCatalog, pidDefinitionsToFormulaEntries } from './pidFormulas.js'`
  - En constructor: `this.pidFormulas = createPidFormulaCatalog(pidDefinitionsToFormulaEntries(ALL_SEED_PIDS))`
  - El resto del fichero sin cambios
- [ ] 3.2 `pnpm test` — todos los tests del adapter (`elm327Adapter.test.ts`) deben seguir verdes: mockean TCP, el catálogo se construye internamente con las mismas fórmulas (ahora desde seed)
- [ ] 3.3 Si algún test del adapter falla, verificar que `ALL_SEED_PIDS` contiene todas las fórmulas que el test espera (Mode 01 + VAG Mode 22)

## 4. VERIFY — Suite completa

- [ ] 4.1 `pnpm lint && pnpm format && pnpm test && pnpm build` — todo verde (483+ tests)
- [ ] 4.2 Verificar que `STANDARD_MODE_01_FORMULAS` y `VAG_MODE_22_FORMULAS` no existen en el codebase:
  ```bash
  grep -r "STANDARD_MODE_01_FORMULAS\|VAG_MODE_22_FORMULAS" apps/core-api/src/ && echo "FAIL: hardcodeo residual" || echo "OK: sin hardcodeo"
  ```
- [ ] 4.3 Verificar que `pidFormulas.ts` no importa de `seed-pids.ts` (separación limpia):
  ```bash
  grep "seed-pids" apps/core-api/src/infrastructure/elm327/pidFormulas.ts && echo "FAIL: dependencia de seed" || echo "OK: sin dependencia"
  ```
- [ ] 4.4 Checklist clean-architecture: `grep -r "from '@/infrastructure" apps/core-api/src/application/` → 0 matches; `grep -r "from '@/application" apps/core-api/src/domain/` → 0 matches

## 5. CIERRE

- [ ] 5.1 Actualizar `SESION ACTUAL` en `AGENTS.md` (dynamic-pid-formulas: catálogo sin hardcodeo, VAG migrado a seed, adapter usa ALL_SEED_PIDS)
- [ ] 5.2 Preguntar al usuario antes de commitear/pushear (regla de sesión 7)
