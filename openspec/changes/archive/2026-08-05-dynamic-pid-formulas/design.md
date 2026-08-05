## Context

Rama `feat/dynamic-pid-formulas`. Fase 4 (Diagnóstico Cognitivo LLM / Refactor Arquitectura). Stack: TypeScript ESM strict, Clean Architecture, Vitest, Drizzle ORM + SQLite.

Estado actual de las fuentes de fórmulas PID:

| Fuente | Dónde | PIDs | Formato |
|---|---|---|---|
| `STANDARD_MODE_01_PIDS` | `seed-pids.ts` | 16 PIDs SAE J1979 | `PidDefinition[]` |
| `TOYOTA_AURIS_MODE_22_PIDS` | `seed-pids.ts` | 4 DIDs Toyota | `PidDefinition[]` (inerte — no cableado a catálogo) |
| `VAG_MODE_22_FORMULAS` | `pidFormulas.ts` | 16 DIDs VW/Audi | `Record<string, PidFormulaEntry>` hardcodeado |
| `STANDARD_MODE_01_FORMULAS` | `pidFormulas.ts` | 16 PIDs | Derivado de `seed-pids.ts` en init de módulo |

Flujo actual:
```
createPidFormulaCatalog()
  → Object.entries(STANDARD_MODE_01_FORMULAS)    // derivado de seed-pids.ts
  → Object.entries(VAG_MODE_22_FORMULAS)          // HARDCODEADO en pidFormulas.ts
  → Map<string, PidFormulaEntry>
  → catalog.get() / catalog.apply()
```

La tabla `pidDefinitions` en SQLite ya existe con schema completo (`mode`, `pid_code`, `formula`, `data_bytes`, ...) y `VehicleRepository.findPidDefinition()` está implementado, pero NO está conectado al catálogo de fórmulas.

Consumidores del catálogo: solo `Elm327TcpRepository` (el simulador `ObdSimulatorRepository` devuelve valores directos sin pasar por fórmulas). La interfaz `PidFormulaCatalog` es sincrónica (`get()` / `apply()`) sin soporte async.

## Goals / Non-Goals

**Goals:**
- Cero hardcodeo de fórmulas en `pidFormulas.ts`. El catálogo recibe sus entradas desde fuera.
- VAG Mode 22 DIDs migrados a `seed-pids.ts` como `PidDefinition[]` (fuente de verdad unificada).
- Helper que convierte `PidDefinition[]` → `Map<string, PidFormulaEntry>` para alimentar el catálogo.
- `Elm327TcpRepository` construye el catálogo desde seed data sin depender de constantes hardcodeadas.
- TDD estricto RED → GREEN → REFACTOR; suite completa verde tras el cambio.
- Diseño preparado para futuro enriquecimiento desde BBDD (`VehicleRepository.findPidDefinition()`).

**Non-Goals:**
- NO se cablea `VehicleRepository` al adapter en este cambio (sería fase siguiente — requiere async init).
- NO se modifica la interfaz `PidFormulaCatalog` (sigue sincrónica).
- NO se toca `ObdSimulator` ni `ObdSimulatorRepository` (no usan el catálogo de fórmulas).
- NO se modifica el schema de Drizzle (`pidDefinitions`) — la tabla ya soporta el modelo.
- NO se modifica `VehicleRepository` ni `SqliteVehicleRepository`.
- NO se modifica el dominio (`PidDefinition`, `PidCode`).
- NO se aborda el bug de `PidDefinition` constructor rechazando `formula: ''` para `pidType: 'ascii'` (el VIN PID en seed-pids.ts tiene formula vacía pero no se instancia vía constructor en este flujo — `STANDARD_MODE_01_PIDS` no incluye Mode 09).

## Decisions

### 1. `createPidFormulaCatalog(entries)` acepta `Iterable` en lugar de hardcodeo

**Elegido**: Cambiar la firma de `createPidFormulaCatalog()` para que acepte un `Iterable<readonly [string, PidFormulaEntry]>` (o directamente un `Map`) en lugar de construir el mapa internamente desde `STANDARD_MODE_01_FORMULAS` y `VAG_MODE_22_FORMULAS`.

```typescript
export function createPidFormulaCatalog(
  entries: Iterable<readonly [string, PidFormulaEntry]>
): PidFormulaCatalog
```

El catálogo resultante es idéntico en comportamiento: `Map` interno, `get()` por clave `"mode pid"`, `apply()` con fallback big-endian para desconocidos.

**Motivo**: Separación de responsabilidades — `pidFormulas.ts` es el motor de aplicación de fórmulas (parseo + fallback), no el repositorio de qué fórmulas existen. Inyectar los datos externamente cumple la regla de "1 fichero = 1 responsabilidad" y elimina el hardcodeo.

**Rechazado**: Aceptar una `async` lookup function `(mode, pid) => Promise<PidFormulaEntry>`. Rompería la interfaz sincrónica de `catalog.get()`/`catalog.apply()` que el adapter usa en `readPid()` sin await. La async init se hará en fase futura cuando se conecte `VehicleRepository`.

### 2. Helper `pidDefinitionsToFormulaEntries()` en `pidFormulas.ts`

**Elegido**: Nueva función exportada que convierte `PidDefinition[]` al formato que espera `createPidFormulaCatalog()`:

```typescript
export function pidDefinitionsToFormulaEntries(
  definitions: ReadonlyArray<{
    pidCode: { key: string }
    formula: string
    dataBytes: number
  }>
): Array<readonly [string, PidFormulaEntry]>
```

El tipo de entrada usa structural typing mínimo (`pidCode.key`, `formula`, `dataBytes`) — no requiere importar `PidDefinition` en `pidFormulas.ts`, manteniendo el módulo genérico y sin dependencia de dominio.

En la práctica, `seed-pids.ts` exporta `PidDefinition[]` que cumple este structural type. La conversión ocurre en el adapter:

```typescript
this.pidFormulas = createPidFormulaCatalog(
  pidDefinitionsToFormulaEntries(ALL_SEED_PIDS)
)
```

**Motivo**: La conversión de `PidDefinition` → entrada de catálogo es mecánica y pertenece al módulo que conoce el formato del catálogo (pidFormulas). Mantenerla allí evita duplicar lógica de transformación en cada consumidor.

**Rechazado**: Hacer la conversión inline en el adapter. Viola DRY si hay más de un consumidor.

### 3. Migración de VAG Mode 22 a `seed-pids.ts` como `VAG_AUDI_MODE_22_PIDS`

**Elegido**: Crear `VAG_AUDI_MODE_22_PIDS: PidDefinition[]` en `seed-pids.ts` con los 16 DIDs actualmente en `VAG_MODE_22_FORMULAS`, usando el mismo patrón que `TOYOTA_AURIS_MODE_22_PIDS`. Incluir en `ALL_SEED_PIDS`.

Mapeo de ejemplo (DID 1130 → Engine Speed):
```typescript
{
  id: 0,
  pidCode: new PidCode('22', '1130'),
  name: 'Engine Speed (VAG)',
  formula: '(A*256+B)/4',
  unit: 'rpm',
  dataBytes: 2,
  pidType: 'formula',
  confidence: 1.0,
  source: 'manual',
  description: 'VAG Mode 22 Engine Speed — Ross-Tech documented',
  minValue: 0,
  maxValue: 16383.75,
}
```

**Motivo**: `seed-pids.ts` es la fuente de verdad unificada de definiciones de PID. Tener los DIDs VAG como `PidDefinition[]` (igual que SAE y Toyota) permite que `ALL_SEED_PIDS` sea el catálogo completo y que `pidDefinitionsToFormulaEntries(ALL_SEED_PIDS)` produzca todas las fórmulas sin distinción de origen.

**Rechazado**: Mantener VAG en `pidFormulas.ts` y solo añadir Toyota. Sería medio refactor — VAG seguiría hardcodeado.

### 4. `Elm327TcpRepository` inyecta `ALL_SEED_PIDS` vía helper

**Elegido**: El constructor del adapter importa `ALL_SEED_PIDS` de `seed-pids.ts` y lo pasa a `createPidFormulaCatalog()` a través de `pidDefinitionsToFormulaEntries()`:

```typescript
import { createPidFormulaCatalog, pidDefinitionsToFormulaEntries } from './pidFormulas.js'
import { ALL_SEED_PIDS } from '../persistence/sqlite/seed-pids.js'

constructor(config: Elm327TcpConfig) {
  this.client = createElm327TcpClient(config)
  this.pidFormulas = createPidFormulaCatalog(
    pidDefinitionsToFormulaEntries(ALL_SEED_PIDS)
  )
}
```

El adapter pasa de depender de `createPidFormulaCatalog()` (sin args, hardcodeo interno) a `createPidFormulaCatalog(entries)` (con args, datos externos).

**Motivo**: El adapter sigue siendo autosuficiente (no requiere async init) y todas las fórmulas conocidas se cargan desde la fuente de verdad unificada. En fase futura, el adapter podrá enriquecer este Map con datos de `VehicleRepository.findPidDefinition()` sin cambiar la interfaz del catálogo.

**Rechazado**: Pasar un `VehicleRepository` al constructor y hacer async lookup por PID. Añadiría async init al adapter (el constructor no puede ser async), complejidad innecesaria para este cambio cuyo objetivo es eliminar hardcodeo, no integrar BBDD.

### 5. Toyota Mode 22 PIDs se activan automáticamente

**Consecuencia del diseño**: `TOYOTA_AURIS_MODE_22_PIDS` ya está en `ALL_SEED_PIDS`, y ahora `ALL_SEED_PIDS` alimenta el catálogo. Por tanto, los 4 DIDs Toyota que estaban inertes pasan a estar disponibles en el catálogo de fórmulas sin código adicional. Esto es un efecto colateral positivo: no hay que hacer nada especial.

### 6. `STANDARD_MODE_01_FORMULAS` se elimina; `STANDARD_MODE_01_PIDS` sigue en `seed-pids.ts`

**Elegido**: Se elimina la constante `STANDARD_MODE_01_FORMULAS` de `pidFormulas.ts` y su derivación desde `STANDARD_MODE_01_PIDS`. La fuente de verdad (`STANDARD_MODE_01_PIDS`) permanece en `seed-pids.ts`. El catálogo se construye desde `ALL_SEED_PIDS` vía el helper, que incluye `STANDARD_MODE_01_PIDS`.

El test `pidFormulas.test.ts` que verificaba `STANDARD_MODE_01_FORMULAS` con 16 entradas se reescribe para verificar que `ALL_SEED_PIDS` produce 36 entradas (16 Mode 01 + 1 Mode 09 + 4 Toyota Mode 22 + 16 VAG Mode 22 = 37; el VIN Mode 09 tiene formula vacía → el helper lo filtra = 36 entradas con fórmula).

**Motivo**: Sin `STANDARD_MODE_01_FORMULAS`, no hay duplicación de la fuente de verdad.

## Data Model

### `PidFormulaEntry` (sin cambios)

```typescript
interface PidFormulaEntry {
  readonly formula: string
  readonly dataBytes: number
}
```

### `PidFormulaCatalog` (sin cambios en interfaz)

```typescript
interface PidFormulaCatalog {
  get(mode: string, pid: string): PidFormulaEntry | undefined
  apply(mode: string, pid: string, bytes: number[]): number
}
```

### `createPidFormulaCatalog` (firma nueva)

```typescript
export function createPidFormulaCatalog(
  entries: Iterable<readonly [string, PidFormulaEntry]>
): PidFormulaCatalog
```

### `pidDefinitionsToFormulaEntries` (nuevo)

```typescript
export function pidDefinitionsToFormulaEntries(
  definitions: ReadonlyArray<{
    pidCode: { key: string }
    formula: string
    dataBytes: number
  }>
): Array<readonly [string, PidFormulaEntry]>
```

Filtra entradas con `formula` vacía (ej. VIN Mode 09 con `pidType: 'ascii'`).

### `VAG_AUDI_MODE_22_PIDS` (nuevo en seed-pids.ts)

16 entradas `PidDefinition[]` con `pidCode: new PidCode('22', did)`, una por cada DID actualmente en `VAG_MODE_22_FORMULAS`.

### `ALL_SEED_PIDS` (actualizado)

```typescript
export const ALL_SEED_PIDS: PidDefinition[] = [
  ...STANDARD_MODE_01_PIDS,      // 16
  ...STANDARD_MODE_09_PIDS,      // 1 (VIN)
  ...TOYOTA_AURIS_MODE_22_PIDS,  // 4
  ...VAG_AUDI_MODE_22_PIDS,      // 16 (NUEVO)
]
```

## Flujo de ejecución (tras el refactor)

```
Elm327TcpRepository constructor
  → pidDefinitionsToFormulaEntries(ALL_SEED_PIDS)
      → filtra fórmulas vacías
      → produce Array<[string, PidFormulaEntry]>
  → createPidFormulaCatalog(entries)
      → new Map(entries)
      → catalog.get() / catalog.apply()

readPid('22', '1130')
  → catalog.get('22', '1130')    // → { formula: '(A*256+B)/4', dataBytes: 2 }  (desde seed, no hardcode)
  → catalog.apply('22', '1130', bytes)  // idéntico comportamiento

readPid('01', '0C')
  → catalog.get('01', '0C')      // → { formula: '(A*256+B)/4', dataBytes: 2 }  (desde seed, no hardcode)
  → catalog.apply('01', '0C', bytes)    // idéntico comportamiento

readPid('01', 'XX')              // PID desconocido
  → catalog.get('01', 'XX')      // → undefined
  → catalog.apply('01', 'XX', bytes)    // → fallback bigEndian(bytes)  (sin cambios)
```

## Test plan

| Fase | Fichero | Casos clave |
|---|---|---|
| RED | `tests/unit/infrastructure/elm327/pidFormulas.test.ts` (reescrito) | `createPidFormulaCatalog` acepta entries y construye catálogo equivalente; `pidDefinitionsToFormulaEntries` convierte PidDefinition-like a entries; filtra fórmulas vacías; `get()`/`apply()` comportamiento idéntico con nuevo constructor; cobertura total de ALL_SEED_PIDS produce 36+ entries |
| GREEN sin tocar | `tests/unit/infrastructure/elm327/elm327Adapter.test.ts` | El adapter mockea TCP — el catálogo es interno y sus pruebas de integración (readPid → valor físico) deben seguir pasando sin cambios si el catálogo tiene las mismas fórmulas |
| Verificación | `pnpm test` | Suite completa verde tras el refactor |
