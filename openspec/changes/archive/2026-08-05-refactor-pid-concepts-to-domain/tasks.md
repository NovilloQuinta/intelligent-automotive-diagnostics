# Tasks — refactor-pid-concepts-to-domain

TDD estricto: RED → GREEN → REFACTOR. Rama: `feat/refactor-pid-concepts-to-domain`. Baseline: 453 tests verdes (36 test files). **Refactor puro — sin cambios de comportamiento.** Cada paso deja la suite compilable y verde salvo el RED inmediato.

## Fase 0: Preparación — rama y baseline

- [x] 0.1 Crear rama: `git checkout -b feat/refactor-pid-concepts-to-domain`
- [x] 0.2 `pnpm lint && pnpm test && pnpm build` — confirmar baseline verde (453 tests)
- [x] 0.3 Crear directorios nuevos si no existen:
  ```bash
  mkdir -p apps/core-api/tests/unit/domain
  mkdir -p apps/core-api/tests/unit/application/shared
  ```

---

## Fase 1: Dominio — `PidFormulaEntry` type + `bigEndian`

### 1.0 RED — Mover test de bigEndian a dominio

- [x] 1.0.1 Crear `tests/unit/domain/bigEndian.test.ts`:
  - Copiar los tests del bloque `describe('bigEndian', ...)` desde `tests/unit/infrastructure/elm327/hexUtils.test.ts` (líneas 36-48)
  - Importar `bigEndian` desde `@/domain/bigEndian.js`
  - RED esperado: `Cannot find module '@/domain/bigEndian.js'`
- [x] 1.0.2 `pnpm test -- tests/unit/domain/bigEndian` — RED (módulo no existe aún)

### 1.1 GREEN — Crear `domain/bigEndian.ts`

- [x] 1.1.1 Crear `apps/core-api/src/domain/bigEndian.ts`:
  - Copiar la función `bigEndian` desde `infrastructure/elm327/hexUtils.ts:27-29`
  - Añadir TSDoc: `/** Int big-endian de todos los bytes (fallback para PIDs sin fórmula conocida). */`
  - Export nombrado, 0 imports
- [x] 1.1.2 `pnpm test -- tests/unit/domain/bigEndian` — GREEN (3 tests pasan)

### 1.2 GREEN — Crear `domain/pidFormulaEntry.ts`

- [x] 1.2.1 Crear `apps/core-api/src/domain/pidFormulaEntry.ts`:
  - Copiar la interface `PidFormulaEntry` desde `infrastructure/elm327/pidFormulas.ts:5-8`
  - Añadir TSDoc: `/** Entrada de fórmula para un PID/DID con su expresión aritmética y bytes esperados. */`
  - Export nombrado, 0 imports
  - **Sin test dedicado** — type definitions no requieren test unitario (validado por tests de consumidores)

### 1.3 CLEANUP — Eliminar tests de bigEndian de hexUtils.test.ts

- [x] 1.3.1 Modificar `tests/unit/infrastructure/elm327/hexUtils.test.ts`:
  - Eliminar el bloque `describe('bigEndian', ...)` (líneas 36-48) y su import de `bigEndian`
  - Eliminar `bigEndian` del import en línea 2: `import { parseHexBytes } from '@/infrastructure/elm327/hexUtils.js'`
  - El fichero conserva solo tests de `parseHexBytes` (7 tests)
- [x] 1.3.2 `pnpm test -- tests/unit/infrastructure/elm327/hexUtils` — GREEN (7 tests de parseHexBytes)

---

## Fase 2: Aplicación — `PidFormulaCatalog` port + mapping shared

### 2.0 GREEN — Crear `application/ports/PidFormulaCatalog.ts`

- [x] 2.0.1 Crear `apps/core-api/src/application/ports/PidFormulaCatalog.ts`:
  - Copiar la interface `PidFormulaCatalog` desde `infrastructure/elm327/pidFormulas.ts:11-28`
  - Cambiar import de `PidFormulaEntry` a `@/domain/pidFormulaEntry.js`
  - TSDoc en la interface y sus métodos (conservar TSDoc existente)
  - Export nombrado
  - **Sin test dedicado** — interface/type definition, validado por tests de `pidFormulaCatalog.test.ts`
- [x] 2.0.2 Verificar disciplina: `grep "from '@/infrastructure" apps/core-api/src/application/ports/PidFormulaCatalog.ts` → 0 matches

### 2.1 RED — Mover test de pidDefinitionMapper a application/shared

- [x] 2.1.1 Crear `tests/unit/application/shared/pidDefinitionsToFormulaEntries.test.ts`:
  - Copiar TODO el contenido de `tests/unit/infrastructure/elm327/pidDefinitionMapper.test.ts`
  - Actualizar imports:
    - `pidDefinitionsToFormulaEntries` → desde `@/application/shared/pidDefinitionsToFormulaEntries.js`
    - `PidFormulaSource` → desde `@/application/shared/pidFormulaSource.js`
  - Cambiar `describe('pidDefinitionMapper', ...)` → `describe('pidDefinitionsToFormulaEntries', ...)`
  - RED esperado: `Cannot find module '@/application/shared/pidFormulaSource.js'` o `.../pidDefinitionsToFormulaEntries.js'`
- [x] 2.1.2 `pnpm test -- tests/unit/application/shared/pidDefinitionsToFormulaEntries` — RED

### 2.2 GREEN — Crear `application/shared/pidFormulaSource.ts`

- [x] 2.2.1 Crear `apps/core-api/src/application/shared/pidFormulaSource.ts`:
  - Copiar la interface `PidFormulaSource` desde `infrastructure/elm327/pidDefinitionMapper.ts:10-14`
  - Conservar TSDoc existente
  - Export nombrado, 0 imports
- [x] 2.2.2 `pnpm test -- tests/unit/application/shared/pidDefinitionsToFormulaEntries` — RED (aún falta `pidDefinitionsToFormulaEntries.ts`)

### 2.3 GREEN — Crear `application/shared/pidDefinitionsToFormulaEntries.ts`

- [x] 2.3.1 Crear `apps/core-api/src/application/shared/pidDefinitionsToFormulaEntries.ts`:
  - Copiar la función `pidDefinitionsToFormulaEntries` desde `infrastructure/elm327/pidDefinitionMapper.ts:22-35`
  - Actualizar imports:
    - `PidFormulaEntry` → desde `@/domain/pidFormulaEntry.js`
    - `PidFormulaSource` → desde `./pidFormulaSource.js`
  - TSDoc conservado
  - Export nombrado
- [x] 2.3.2 `pnpm test -- tests/unit/application/shared/pidDefinitionsToFormulaEntries` — GREEN (4 tests pasan)
- [x] 2.3.3 Verificar disciplina: `grep "from '@/infrastructure" apps/core-api/src/application/shared/pidDefinitionsToFormulaEntries.ts` → 0 matches

---

## Fase 3: Infraestructura — `pidFormulaCatalog.ts` + actualizar adapter + limpiar hexUtils

### 3.1 RED — Mover test de pidFormulas a pidFormulaCatalog

- [x] 3.1.1 Crear `tests/unit/infrastructure/elm327/pidFormulaCatalog.test.ts`:
  - Copiar TODO el contenido de `tests/unit/infrastructure/elm327/pidFormulas.test.ts`
  - Actualizar imports:
    - `createPidFormulaCatalog` → desde `@/infrastructure/elm327/pidFormulaCatalog.js`
    - `PidFormulaEntry` → desde `@/domain/pidFormulaEntry.js`
  - Cambiar `describe('pidFormulas', ...)` → `describe('pidFormulaCatalog', ...)`
  - RED esperado: `Cannot find module '@/infrastructure/elm327/pidFormulaCatalog.js'`
- [x] 3.1.2 `pnpm test -- tests/unit/infrastructure/elm327/pidFormulaCatalog` — RED

### 3.2 GREEN — Crear `infrastructure/elm327/pidFormulaCatalog.ts`

- [x] 3.2.1 Crear `apps/core-api/src/infrastructure/elm327/pidFormulaCatalog.ts`:
  - Copiar `pidKey` (private helper) y `createPidFormulaCatalog` (factory) desde `pidFormulas.ts`
  - Actualizar imports:
    - `evaluatePid` → desde `@/domain/services/pidFormula.js`
    - `bigEndian` → desde `@/domain/bigEndian.js`
    - `PidFormulaEntry` → desde `@/domain/pidFormulaEntry.js`
    - `PidFormulaCatalog` → desde `@/application/ports/PidFormulaCatalog.js`
  - Eliminar exports de `PidFormulaEntry` y `PidFormulaCatalog` (ya no viven aquí)
  - `pidKey` sigue siendo función privada (no exportada)
  - TSDoc conservado en `createPidFormulaCatalog`
- [x] 3.2.2 `pnpm test -- tests/unit/infrastructure/elm327/pidFormulaCatalog` — GREEN (mismos tests que antes, imports actualizados)

### 3.3 GREEN — Actualizar imports en `elm327Adapter.ts`

- [x] 3.3.1 Modificar `apps/core-api/src/infrastructure/elm327/elm327Adapter.ts`:
  - Cambiar línea 6: `import { createPidFormulaCatalog } from './pidFormulas.js'` → `from './pidFormulaCatalog.js'`
  - Cambiar línea 7: `import type { PidFormulaCatalog } from './pidFormulas.js'` → `from '@/application/ports/PidFormulaCatalog.js'`
  - Cambiar línea 8: `import { pidDefinitionsToFormulaEntries } from './pidDefinitionMapper.js'` → `from '@/application/shared/pidDefinitionsToFormulaEntries.js'`
  - El resto del fichero SIN CAMBIOS
- [x] 3.3.2 `pnpm test -- tests/unit/infrastructure/elm327/elm327Adapter` — GREEN (mockea TCP, el catálogo es interno)

### 3.4 GREEN — Eliminar `bigEndian` de `hexUtils.ts`

- [x] 3.4.1 Modificar `apps/core-api/src/infrastructure/elm327/hexUtils.ts`:
  - Eliminar la función `bigEndian` (líneas 27-29) y su TSDoc
  - El fichero conserva `parseHexBytes` y `HEX_TOKEN_RE`
- [x] 3.4.2 `pnpm test -- tests/unit/infrastructure/elm327/hexUtils` — GREEN (solo tests de parseHexBytes)

---

## Fase 4: Eliminar archivos obsoletos

### 4.1 Eliminar `pidFormulas.ts`

- [x] 4.1.1 Verificar que ningún otro fichero importa de `pidFormulas.ts` (salvo el test ya renombrado):
  ```bash
  grep -r "from.*pidFormulas" apps/core-api/src/ --include="*.ts" | grep -v pidFormulaCatalog
  ```
  Debe devolver 0 resultados (elm327Adapter.ts ya apunta a pidFormulaCatalog.ts).
- [x] 4.1.2 Eliminar `apps/core-api/src/infrastructure/elm327/pidFormulas.ts`
- [x] 4.1.3 Eliminar `apps/core-api/tests/unit/infrastructure/elm327/pidFormulas.test.ts` (ya migrado a `pidFormulaCatalog.test.ts`)
- [x] 4.1.4 `pnpm test` — GREEN (el test de pidFormulaCatalog.test.ts cubre la misma lógica)

### 4.2 Eliminar `pidDefinitionMapper.ts`

- [x] 4.2.1 Verificar que ningún otro fichero importa de `pidDefinitionMapper.ts`:
  ```bash
  grep -r "from.*pidDefinitionMapper" apps/core-api/src/ --include="*.ts"
  ```
  Debe devolver 0 resultados (elm327Adapter.ts ya apunta a application/shared/).
- [x] 4.2.2 Eliminar `apps/core-api/src/infrastructure/elm327/pidDefinitionMapper.ts`
- [x] 4.2.3 Eliminar `apps/core-api/tests/unit/infrastructure/elm327/pidDefinitionMapper.test.ts` (ya migrado a `application/shared/`)
- [x] 4.2.4 `pnpm test` — GREEN

---

## Fase 5: Verificación final

- [x] 5.1 `pnpm lint && pnpm format && pnpm test && pnpm build` — todo verde
- [x] 5.2 Verificar conteo de tests: mismo número que baseline (453 passing). Ajuste esperado: se crean 2 test files nuevos (domain/bigEndian, application/shared/pidDefinitionsToFormulaEntries), se eliminan 2 test files viejos (pidFormulas.test.ts, pidDefinitionMapper.test.ts), 1 test file se renombra (pidFormulaCatalog.test.ts), 1 test file se reduce (hexUtils.test.ts pierde tests de bigEndian). Neto: mismo número de tests.
- [x] 5.3 Checklist Clean Architecture:
  ```bash
  # 0 imports de infra en application/
  grep -r "from '@/infrastructure" apps/core-api/src/application/ && echo "FAIL" || echo "OK: 0 infra imports in application"
  
  # 0 imports de application o infra en domain/
  grep -r "from '@/application\|from '@/infrastructure" apps/core-api/src/domain/ && echo "FAIL" || echo "OK: 0 app/infra imports in domain"
  
  # pidFormulas.ts eliminado
  ls apps/core-api/src/infrastructure/elm327/pidFormulas.ts 2>/dev/null && echo "FAIL" || echo "OK: pidFormulas.ts deleted"
  
  # pidDefinitionMapper.ts eliminado
  ls apps/core-api/src/infrastructure/elm327/pidDefinitionMapper.ts 2>/dev/null && echo "FAIL" || echo "OK: pidDefinitionMapper.ts deleted"
  
  # hexUtils.ts ya no exporta bigEndian
  grep "bigEndian" apps/core-api/src/infrastructure/elm327/hexUtils.ts && echo "FAIL" || echo "OK: bigEndian removed from hexUtils"
  ```
- [x] 5.4 Verificar que `pidFormulaCatalog.ts` no exporta `pidKey` (debe ser privada):
  ```bash
  grep "export.*pidKey" apps/core-api/src/infrastructure/elm327/pidFormulaCatalog.ts && echo "FAIL: pidKey exported" || echo "OK: pidKey private"
  ```
- [x] 5.5 Verificar que los imports de `PidFormulaEntry` desde infrastructure ya no pasan por infra:
  ```bash
  grep "from.*pidFormulas.*PidFormulaEntry" apps/core-api/src/infrastructure/ -r && echo "FAIL: stale import" || echo "OK"
  ```

---

## Fase 6: Cierre

- [x] 6.1 Actualizar `SESION ACTUAL` en `AGENTS.md`:
  ```
  - **Fase**: 4 — Diagnostico Cognitivo LLM / Refactor Arquitectura
  - **Ultimo paso**: Refactor `refactor-pid-concepts-to-domain` completado. PidFormulaEntry → domain/, PidFormulaCatalog → application/ports/, bigEndian → domain/, PidFormulaSource + pidDefinitionsToFormulaEntries → application/shared/. createPidFormulaCatalog → infrastructure/elm327/pidFormulaCatalog.ts. Eliminados pidFormulas.ts y pidDefinitionMapper.ts.
  - **Tests**: [N] pasando, [N] test files
  ```
- [ ] 6.2 Preguntar al usuario antes de commitear/pushear (regla de sesión 7)
