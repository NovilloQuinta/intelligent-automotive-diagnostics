## Context

Rama `feat/refactor-pid-concepts-to-domain`. Fase 4 (Diagnóstico Cognitivo LLM / Refactor Arquitectura). Stack: TypeScript ESM strict, Clean Architecture, Vitest, Drizzle ORM + SQLite. Baseline: 453 tests verdes (36 test files), 0 violaciones de capa domain→infra/application→infra.

Estado actual de la mezcla de capas en `infrastructure/elm327/`:

| Concepto | Archivo actual | Capa real | Capa actual | Problema |
|---|---|---|---|---|
| `PidFormulaEntry` (type) | `pidFormulas.ts:5-8` | domain | infra | Tipo de dominio en capa incorrecta |
| `PidFormulaCatalog` (interface) | `pidFormulas.ts:11-28` | application/ports | infra | Puerto en infra — debería estar en ports |
| `createPidFormulaCatalog` (factory) | `pidFormulas.ts:48-63` | infra | infra | OK — Map interno es detalle de infra |
| `pidKey` (helper privado) | `pidFormulas.ts:31-33` | infra | infra | OK — helper de la factory |
| `PidFormulaSource` (type) | `pidDefinitionMapper.ts:10-14` | application/shared | infra | Structural type en capa incorrecta |
| `pidDefinitionsToFormulaEntries` (fn) | `pidDefinitionMapper.ts:22-35` | application/shared | infra | Mapping entre capas en infra |
| `bigEndian` (pure fn) | `hexUtils.ts:27-29` | domain | infra | Cálculo matemático puro — no es ELM327 |

Flujo de dependencias actual (incorrecto):
```
elm327Adapter.ts (infra)
  → pidFormulas.ts (infra)            // PidFormulaEntry, PidFormulaCatalog, createPidFormulaCatalog
    → hexUtils.ts (infra)             // bigEndian (fallback)
    → domain/services/pidFormula.ts   // evaluatePid
  → pidDefinitionMapper.ts (infra)    // pidDefinitionsToFormulaEntries
  → persistence/sqlite/seed-pids.ts   // ALL_SEED_PIDS
```

Flujo de dependencias tras el refactor (correcto):
```
domain/pidFormulaEntry.ts             // type puro, 0 imports
domain/bigEndian.ts                   // fn pura, 0 imports

application/ports/PidFormulaCatalog.ts // puerto, importa solo domain/pidFormulaEntry.ts
application/shared/pidFormulaSource.ts // structural type, 0 imports
application/shared/pidDefinitionsToFormulaEntries.ts // mapping, importa domain/ + shared/

infrastructure/elm327/pidFormulaCatalog.ts // factory, importa domain/ + application/ports/
infrastructure/elm327/elm327Adapter.ts     // adapter, importa infra/ + application/ports/ + application/shared/
```

La disciplina de capas tras el refactor:
- `domain/` → 0 imports de capas superiores ✓
- `application/` → importa `domain/`, NUNCA `infrastructure/` ✓
- `infrastructure/` → importa `domain/` y `application/` ✓

## Goals / Non-Goals

**Goals:**
- `PidFormulaEntry` type reside en `domain/pidFormulaEntry.ts` (camelCase), 0 dependencias.
- `bigEndian` pure function reside en `domain/bigEndian.ts` (camelCase), 0 dependencias.
- `PidFormulaCatalog` interface reside en `application/ports/PidFormulaCatalog.ts` (PascalCase), importa solo `domain/pidFormulaEntry.ts`.
- `PidFormulaSource` structural type reside en `application/shared/pidFormulaSource.ts` (camelCase).
- `pidDefinitionsToFormulaEntries` reside en `application/shared/pidDefinitionsToFormulaEntries.ts` (camelCase), importa `domain/pidFormulaEntry.ts` + `application/shared/pidFormulaSource.ts`.
- `createPidFormulaCatalog` factory + `pidKey` helper residen en `infrastructure/elm327/pidFormulaCatalog.ts` (camelCase), importa `domain/pidFormulaEntry.ts`, `domain/bigEndian.ts`, `domain/services/pidFormula.ts`, `application/ports/PidFormulaCatalog.ts`.
- `Elm327TcpRepository` actualiza sus imports a las nuevas ubicaciones — sin cambios de comportamiento.
- `hexUtils.ts` elimina `bigEndian`, conserva solo `parseHexBytes`.
- Archivos `pidFormulas.ts` y `pidDefinitionMapper.ts` eliminados (contenido migrado).
- Tests movidos/renombrados a las nuevas ubicaciones de los módulos.
- TDD estricto: RED → GREEN → REFACTOR por cada migración.
- Suite completa verde tras cada paso (los tests se mueven, no se reescriben).

**Non-Goals:**
- NO se modifica el comportamiento de `createPidFormulaCatalog`, `pidDefinitionsToFormulaEntries`, `bigEndian`, ni `evaluatePid`.
- NO se cambian las firmas públicas de ningún export.
- NO se modifica `elm327Adapter.test.ts` más allá de imports (mockea TCP, no toca el catálogo).
- NO se modifica `domain/services/pidFormula.ts` (`evaluatePid`, `validateFormulaSyntax`, `PidParseError`).
- NO se modifica `persistence/sqlite/seed-pids.ts` ni `ALL_SEED_PIDS`.
- NO se modifica el schema de Drizzle.
- NO se añaden nuevas funcionalidades — es un refactor puro de ubicación de conceptos.

## Decisions

### 1. `PidFormulaEntry` va a `domain/pidFormulaEntry.ts` (camelCase)

**Elegido**: Mover el type `PidFormulaEntry` a `domain/pidFormulaEntry.ts` como export nombrado.

```typescript
/** Entrada de fórmula para un PID/DID con su expresión aritmética y bytes esperados. */
export interface PidFormulaEntry {
  readonly formula: string
  readonly dataBytes: number
}
```

**Motivo**: `PidFormulaEntry` representa el concepto SAE J1979 de "entrada de fórmula" — `formula` (expresión aritmética) y `dataBytes` (bytes esperados en la respuesta). Es conocimiento de dominio puro, sin dependencias de infraestructura. Pertenece a `domain/`.

**Rechazado**: Dejarlo en infraestructura. Viola la disciplina de capas — el dominio no puede depender de infraestructura, pero infraestructura sí puede (y debe) depender de dominio.

### 2. `PidFormulaCatalog` va a `application/ports/PidFormulaCatalog.ts` (PascalCase)

**Elegido**: Mover la interface `PidFormulaCatalog` a `application/ports/PidFormulaCatalog.ts`. La interface define el contrato (puerto) que el adapter (`elm327Adapter.ts`) consume y que la factory (`pidFormulaCatalog.ts`) implementa.

```typescript
import type { PidFormulaEntry } from '@/domain/pidFormulaEntry.js'

export interface PidFormulaCatalog {
  get(mode: string, pid: string): PidFormulaEntry | undefined
  apply(mode: string, pid: string, bytes: number[]): number
}
```

**Motivo**: Es un puerto de aplicación (define un contrato entre capas), no una implementación. `application/ports/` es su ubicación canónica según Clean Architecture. El nombre PascalCase sigue la convención del proyecto para puertos (`ObdRepository.ts`, `PidFormulaCatalog.ts`).

**Rechazado**: Dejarlo en `infrastructure/` junto con su implementación. Viola SRP y hace que el adapter importe interfaces de infraestructura en lugar de puertos de aplicación.

### 3. `bigEndian` va a `domain/bigEndian.ts` (camelCase)

**Elegido**: Mover `bigEndian` a `domain/bigEndian.ts`. Es una función matemática pura: recibe `number[]` y devuelve `number`. 0 imports, 0 efectos secundarios.

```typescript
/** Int big-endian de todos los bytes (fallback para PIDs sin fórmula conocida). */
export function bigEndian(bytes: number[]): number {
  return bytes.reduce((acc, b) => acc * 256 + b, 0)
}
```

**Motivo**: `bigEndian` es un cálculo aritmético (interpretación big-endian de una secuencia de bytes). No tiene nada que ver con ELM327, hex parsing, ni protocolo OBD. Pertenece al dominio como utilidad matemática. Estar en `hexUtils.ts` (infraestructura) es un error de ubicación.

**Consumidores actuales**: Solo `pidFormulas.ts` → tras el refactor, `infrastructure/elm327/pidFormulaCatalog.ts` importará desde `@/domain/bigEndian.js`.

**Rechazado**: Dejarlo en `hexUtils.ts`. Mezcla utilidades de infraestructura (`parseHexBytes`) con utilidades de dominio (`bigEndian`).

### 4. `hexUtils.ts` conserva solo `parseHexBytes`

**Elegido**: `hexUtils.ts` elimina la exportación de `bigEndian` y conserva solo `parseHexBytes`. El fichero sigue en `infrastructure/elm327/` porque `parseHexBytes` lanza `Elm327ParseError` (error de infraestructura).

**Motivo**: `parseHexBytes` es específico del parsing de respuestas ELM327 (valida formato hex, lanza errores de dominio ELM327). Pertenece a infraestructura. Separar `bigEndian` al dominio limpia la responsabilidad del módulo.

### 5. `PidFormulaSource` y `pidDefinitionsToFormulaEntries` van a `application/shared/`

**Elegido**: Mover `PidFormulaSource` type a `application/shared/pidFormulaSource.ts` y `pidDefinitionsToFormulaEntries` a `application/shared/pidDefinitionsToFormulaEntries.ts` (ambos camelCase).

`pidFormulaSource.ts`:
```typescript
export interface PidFormulaSource {
  readonly pidCode: { readonly key: string }
  readonly formula: string | { toString(): string }
  readonly dataBytes: number
}
```

`pidDefinitionsToFormulaEntries.ts`:
```typescript
import type { PidFormulaEntry } from '@/domain/pidFormulaEntry.js'
import type { PidFormulaSource } from './pidFormulaSource.js'

export function pidDefinitionsToFormulaEntries(
  definitions: Iterable<PidFormulaSource>,
): Array<readonly [string, PidFormulaEntry]>
```

**Motivo**: Estas piezas son mapping entre conceptos de dominio (`PidDefinition`, `PidFormulaEntry`) y el catálogo de fórmulas. No implementan ningún puerto (no son adaptadores), ni son conocimiento de dominio puro (son transformación entre capas). `application/shared/` es la ubicación canónica para lógica compartida de aplicación que no es un puerto ni un use case.

La disciplina de capas se mantiene: `application/shared/` importa `domain/pidFormulaEntry.ts` ✓, no importa `infrastructure/` ✓.

**Rechazado**:
- Dejarlo en infraestructura: la lógica de mapping entre dominio y aplicación no es responsabilidad de infraestructura.
- Moverlo a dominio: `PidFormulaSource` es un structural type que acepta objetos con `toString()` (no es un value object de dominio puro).

### 6. `createPidFormulaCatalog` y `pidKey` van a `infrastructure/elm327/pidFormulaCatalog.ts`

**Elegido**: Crear `infrastructure/elm327/pidFormulaCatalog.ts` (camelCase) con la factory `createPidFormulaCatalog` y el helper privado `pidKey`. El fichero `pidFormulas.ts` se elimina tras la migración.

```typescript
import { evaluatePid } from '@/domain/services/pidFormula.js'
import { bigEndian } from '@/domain/bigEndian.js'
import type { PidFormulaEntry } from '@/domain/pidFormulaEntry.js'
import type { PidFormulaCatalog } from '@/application/ports/PidFormulaCatalog.js'

function pidKey(mode: string, pid: string): string {
  return `${mode.toUpperCase()} ${pid.toUpperCase()}`
}

export function createPidFormulaCatalog(
  entries: Iterable<readonly [string, PidFormulaEntry]>,
): PidFormulaCatalog {
  const map = new Map<string, PidFormulaEntry>(entries)
  return {
    get(mode, pid) { return map.get(pidKey(mode, pid)) },
    apply(mode, pid, bytes) {
      const entry = map.get(pidKey(mode, pid))
      if (!entry) return bigEndian(bytes)
      return evaluatePid(entry.formula, bytes.slice(0, entry.dataBytes))
    },
  }
}
```

**Motivo**: La factory usa `Map` (detalle de implementación) e implementa el puerto `PidFormulaCatalog`. Esto es claramente infraestructura. El nombre `pidFormulaCatalog.ts` refleja que el fichero contiene la implementación concreta del catálogo, no la definición del tipo/interface.

La disciplina de capas: `infrastructure/elm327/pidFormulaCatalog.ts` importa `domain/pidFormulaEntry.ts`, `domain/bigEndian.ts`, `domain/services/pidFormula.ts`, `application/ports/PidFormulaCatalog.ts` ✓.

**Rechazado**: Mantener el nombre `pidFormulas.ts`. Es confuso porque implica que contiene múltiples conceptos de fórmulas (types, interfaces, factory), cuando tras el refactor solo contiene la factory.

### 7. Eliminación de `pidFormulas.ts` y `pidDefinitionMapper.ts`

**Elegido**: Ambos ficheros se eliminan tras migrar todo su contenido a las nuevas ubicaciones. No se conservan re-exports — la migración es completa.

**Motivo**: Conservar ficheros con re-exports crea indirección y deuda técnica. Los consumidores (solo `elm327Adapter.ts` para el código de producción) se actualizan a las nuevas rutas directamente.

### 8. Convenciones de nombres por capa

| Capa | Convención | Ejemplos |
|---|---|---|
| `domain/` | camelCase | `pidFormulaEntry.ts`, `bigEndian.ts`, `pids.ts` |
| `application/ports/` | PascalCase | `PidFormulaCatalog.ts`, `ObdRepository.ts` |
| `application/shared/` | camelCase | `pidFormulaSource.ts`, `pidDefinitionsToFormulaEntries.ts`, `hashToken.ts` |
| `infrastructure/elm327/` | camelCase | `pidFormulaCatalog.ts`, `elm327Adapter.ts`, `hexUtils.ts` |

**Motivo**: La convención PascalCase para puertos los hace visualmente distintos de otros módulos de application (use cases, services, shared). Es una convención ya establecida en el proyecto (`application/ports/` tiene `ObdRepository.ts`, `VehicleRepository.ts`, etc.).

### 9. Tests — mover, no reescribir

**Elegido**: Los tests se mueven a las nuevas ubicaciones con ajustes mínimos de imports. No se reescribe lógica de test.

| Test actual | Test nuevo | Cambios |
|---|---|---|
| `tests/unit/infrastructure/elm327/pidFormulas.test.ts` | `tests/unit/infrastructure/elm327/pidFormulaCatalog.test.ts` | Actualizar imports |
| `tests/unit/infrastructure/elm327/pidDefinitionMapper.test.ts` | `tests/unit/application/shared/pidDefinitionsToFormulaEntries.test.ts` | Actualizar imports |
| `tests/unit/infrastructure/elm327/hexUtils.test.ts` (tests de bigEndian) | `tests/unit/domain/bigEndian.test.ts` | Extraer solo tests de bigEndian |

**Motivo**: Los tests validan comportamiento, no ubicación. Moverlos a las capas correctas refleja la nueva arquitectura sin perder cobertura. El test de `hexUtils.test.ts` conserva los tests de `parseHexBytes` (infra) y pierde los de `bigEndian` (movidos a dominio).

## Data Model

### `PidFormulaEntry` (domain/pidFormulaEntry.ts — sin cambios)

```typescript
export interface PidFormulaEntry {
  readonly formula: string
  readonly dataBytes: number
}
```

### `PidFormulaCatalog` (application/ports/PidFormulaCatalog.ts — sin cambios de interfaz)

```typescript
export interface PidFormulaCatalog {
  get(mode: string, pid: string): PidFormulaEntry | undefined
  apply(mode: string, pid: string, bytes: number[]): number
}
```

### `PidFormulaSource` (application/shared/pidFormulaSource.ts — sin cambios)

```typescript
export interface PidFormulaSource {
  readonly pidCode: { readonly key: string }
  readonly formula: string | { toString(): string }
  readonly dataBytes: number
}
```

### `createPidFormulaCatalog` (infrastructure/elm327/pidFormulaCatalog.ts — sin cambios de firma)

```typescript
export function createPidFormulaCatalog(
  entries: Iterable<readonly [string, PidFormulaEntry]>,
): PidFormulaCatalog
```

### `pidDefinitionsToFormulaEntries` (application/shared/pidDefinitionsToFormulaEntries.ts — sin cambios de firma)

```typescript
export function pidDefinitionsToFormulaEntries(
  definitions: Iterable<PidFormulaSource>,
): Array<readonly [string, PidFormulaEntry]>
```

### `bigEndian` (domain/bigEndian.ts — sin cambios de firma)

```typescript
export function bigEndian(bytes: number[]): number
```

### `parseHexBytes` (infrastructure/elm327/hexUtils.ts — conservado, sin cambios)

```typescript
export function parseHexBytes(hex: string): number[]
```

## Flujo de ejecución (tras el refactor)

```
Elm327TcpRepository constructor
  → pidDefinitionsToFormulaEntries(ALL_SEED_PIDS)    // application/shared/
      → filtra fórmulas vacías
      → produce Array<[string, PidFormulaEntry]>     // domain/pidFormulaEntry.ts
  → createPidFormulaCatalog(entries)                  // infrastructure/elm327/pidFormulaCatalog.ts
      → new Map(entries)                              // implementa PidFormulaCatalog (application/ports/)
      → catalog.get() / catalog.apply()
          → evaluatePid()                             // domain/services/pidFormula.ts
          → bigEndian()                               // domain/bigEndian.ts

readPid('01', '0C')
  → catalog.get('01', '0C')         // → PidFormulaEntry | undefined (domain/)
  → catalog.apply('01', '0C', bytes) // → number (usa domain/pidFormula.ts + domain/bigEndian.ts)
```

Las dependencias siguen el flujo Clean Architecture: domain ← application ← infrastructure.

## Test plan

| Fase | Fichero | Cambios |
|---|---|---|
| Mover | `tests/unit/domain/bigEndian.test.ts` (nuevo) | Extraer tests de `bigEndian` desde `hexUtils.test.ts`. Importa desde `@/domain/bigEndian.js`. |
| Mover | `tests/unit/application/shared/pidDefinitionsToFormulaEntries.test.ts` (nuevo) | Renombrar desde `pidDefinitionMapper.test.ts`. Actualizar imports. |
| Mover | `tests/unit/infrastructure/elm327/pidFormulaCatalog.test.ts` (nuevo) | Renombrar desde `pidFormulas.test.ts`. Actualizar imports. |
| Modificar | `tests/unit/infrastructure/elm327/hexUtils.test.ts` | Eliminar tests de `bigEndian`, conservar tests de `parseHexBytes`. |
| Verificar | `tests/unit/infrastructure/elm327/elm327Adapter.test.ts` | Sin cambios — mockea TCP, el catálogo es interno. |
| Suite | `pnpm test` | Mismo número de tests pasando (453), solo cambian ubicaciones. |

### Verificaciones de disciplina post-refactor

```bash
# 0 imports de infra en application/
grep -r "from '@/infrastructure" apps/core-api/src/application/ && echo "FAIL" || echo "OK"

# 0 imports de application o infra en domain/
grep -r "from '@/application\|from '@/infrastructure" apps/core-api/src/domain/ && echo "FAIL" || echo "OK"

# pidFormulas.ts y pidDefinitionMapper.ts eliminados
ls apps/core-api/src/infrastructure/elm327/pidFormulas.ts 2>/dev/null && echo "FAIL" || echo "OK: pidFormulas.ts eliminado"
ls apps/core-api/src/infrastructure/elm327/pidDefinitionMapper.ts 2>/dev/null && echo "FAIL" || echo "OK: pidDefinitionMapper.ts eliminado"

# hexUtils.ts ya no exporta bigEndian
grep "bigEndian" apps/core-api/src/infrastructure/elm327/hexUtils.ts && echo "FAIL" || echo "OK: bigEndian fuera de hexUtils"
```
