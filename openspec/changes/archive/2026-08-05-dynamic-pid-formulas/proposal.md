## Why

`pidFormulas.ts` tiene dos fuentes de fórmulas hardcodeadas en memoria:

- `STANDARD_MODE_01_FORMULAS` — derivada de `STANDARD_MODE_01_PIDS` en `seed-pids.ts`, pero forma un catálogo independiente duplicando la fuente de verdad.
- `VAG_MODE_22_FORMULAS` — 16 DIDs de VW/Audi hardcodeados directamente en el fichero, sin representación en `seed-pids.ts` ni en la tabla `pidDefinitions` de la BBDD.

Además, `TOYOTA_AURIS_MODE_22_PIDS` ya existe en `seed-pids.ts` como `PidDefinition[]` pero NO está cableado al catálogo de fórmulas — está definido pero inerte. Esto demuestra la fragmentación: hay tres fuentes distintas (hardcodeo VAG, derivado SAE, seed data Toyota) y ninguna unificada.

Un coche real (o simulador) reporta PIDs soportados vía `01 00`, y las fórmulas deberían consultarse de la BBDD (`pidDefinitions` en SQLite). Con el modelo actual, añadir un PID nuevo requiere tocar `pidFormulas.ts` (código de infraestructura) — rompe el principio de catálogo auto-expansivo que la tabla `pidDefinitions` ya provee.

Eliminar el hardcodeo unifica el flujo: tanto simulación como coche real consultan la misma fuente para resolver fórmulas, y añadir un PID nuevo es solo insertar una fila en BBDD (vía seed o vía LLM discovery).

## What Changes

- **Eliminar hardcodeo en `pidFormulas.ts`**: se eliminan `STANDARD_MODE_01_FORMULAS` y `VAG_MODE_22_FORMULAS`. `createPidFormulaCatalog()` pasa a aceptar un `Map<string, PidFormulaEntry>` externo en lugar de construirlo internamente desde constantes.
- **Migrar fórmulas VAG Mode 22 a `seed-pids.ts`**: 16 DIDs VW/Audi se añaden como `VAG_AUDI_MODE_22_PIDS: PidDefinition[]` (mismo patrón que `TOYOTA_AURIS_MODE_22_PIDS`), se incluyen en `ALL_SEED_PIDS`.
- **Helper `createFormulaMapFromSeedPids()`**: nueva función en `pidFormulas.ts` que convierte `PidDefinition[]` → `Map<string, PidFormulaEntry>` para alimentar el catálogo.
- **`Elm327TcpRepository` inyecta el Map**: el adapter construye el catálogo desde los seed PIDs en su constructor, sin dependencia de constantes hardcodeadas.
- **Tests**: `pidFormulas.test.ts` y `elm327Adapter.test.ts` se actualizan al nuevo contrato.

## Capabilities

### New Capabilities
- `dynamic-pid-formulas`: Catálogo de fórmulas PID sin hardcodeo — `createPidFormulaCatalog(entries)` acepta un `Map` externo, `createFormulaMapFromSeedPids()` convierte `PidDefinition[]` a entradas del catálogo, VAG Mode 22 DIDs migrados a `seed-pids.ts` como fuente de verdad unificada.

### Modified Capabilities
- `elm327-tcp-repository`: El adapter ELM327 ahora construye el catálogo de fórmulas desde seed data en construcción, en lugar de depender de constantes hardcodeadas en `pidFormulas.ts`.

## Impact

- Modificado: `apps/core-api/src/infrastructure/elm327/pidFormulas.ts` (elimina hardcodeo, cambia firma de `createPidFormulaCatalog`)
- Modificado: `apps/core-api/src/infrastructure/elm327/elm327Adapter.ts` (inyecta Map en `createPidFormulaCatalog`)
- Modificado: `apps/core-api/src/infrastructure/persistence/sqlite/seed-pids.ts` (añade `VAG_AUDI_MODE_22_PIDS`)
- Modificado: `apps/core-api/tests/unit/infrastructure/elm327/pidFormulas.test.ts` (actualiza a nuevo contrato)
- Modificado: `apps/core-api/tests/unit/infrastructure/elm327/elm327Adapter.test.ts` (no requiere cambios — mockea TCP, no toca el catálogo)
- Sin cambios: `ObdSimulatorRepository`, `ObdSimulator`, `VehicleRepository`, tabla `pidDefinitions`
