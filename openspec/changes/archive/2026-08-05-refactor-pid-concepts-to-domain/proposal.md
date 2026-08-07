## Why

`infrastructure/elm327/pidFormulas.ts` mezcla conceptos de 3 capas distintas en un solo módulo de infraestructura:

- `PidFormulaEntry` (type) — conocimiento de dominio SAE J1979 (definición de entrada de fórmula)
- `PidFormulaCatalog` (interface) — contrato que debería ser un puerto en `application/ports/`
- `createPidFormulaCatalog` (factory) — implementación concreta (Map), legítimamente en infraestructura

`infrastructure/elm327/pidDefinitionMapper.ts` convierte definiciones domain → entries de catálogo. Su lógica es de mapping puro entre capas (domain ↔ application), no pertenece a infraestructura.

`infrastructure/elm327/hexUtils.ts` contiene `bigEndian`, una función de cálculo matemático puro (0 dependencias de ELM327), que pertenece al dominio.

Esta mezcla viola la disciplina de Clean Architecture: tipos de dominio y puertos de aplicación viven en infraestructura, forzando dependencias incorrectas y dificultando el testing aislado.

## What Changes

- **Extraer `PidFormulaEntry` al dominio**: `domain/pidFormulaEntry.ts` — type puro sin dependencias.
- **Extraer `bigEndian` al dominio**: `domain/bigEndian.ts` — función pura, 0 imports de capas superiores.
- **Extraer `PidFormulaCatalog` a `application/ports/`**: `application/ports/PidFormulaCatalog.ts` — puerto que define el contrato del catálogo.
- **Extraer `PidFormulaSource` y `pidDefinitionsToFormulaEntries` a `application/shared/`**: mapping entre dominio y catálogo — no implementa ningún puerto, es lógica compartida.
- **Renombrar `pidFormulas.ts` → `pidFormulaCatalog.ts`**: el fichero residual solo contiene la factory `createPidFormulaCatalog` y el helper privado `pidKey`.
- **Eliminar `pidDefinitionMapper.ts`**: contenido migrado a `application/shared/`.
- **Actualizar imports en `elm327Adapter.ts`**: apuntar a las nuevas ubicaciones.
- **Eliminar `bigEndian` de `hexUtils.ts`**: la función se mueve al dominio; `hexUtils.ts` conserva solo `parseHexBytes`.
- **Mover/renombrar tests**: reflejar las nuevas ubicaciones de los módulos.

## Capabilities

### New Capabilities
- `domain-pid-concepts`: `PidFormulaEntry` type y `bigEndian` pure function en `domain/`; `PidFormulaCatalog` interface en `application/ports/` como puerto del catálogo de fórmulas.
- `pid-formula-mapping`: `PidFormulaSource` structural type y `pidDefinitionsToFormulaEntries` conversion function en `application/shared/` para mapping dominio → entries de catálogo.

### Modified Capabilities
- `elm327-tcp-repository`: El adapter `Elm327TcpRepository` actualiza sus imports a las nuevas ubicaciones de `createPidFormulaCatalog`, `PidFormulaCatalog`, `pidDefinitionsToFormulaEntries`. Los 8 métodos públicos del puerto `ObdRepository` mantienen firma y comportamiento idénticos.

## Impact

- **Nuevo**: `apps/core-api/src/domain/pidFormulaEntry.ts` (`PidFormulaEntry` type)
- **Nuevo**: `apps/core-api/src/domain/bigEndian.ts` (`bigEndian` pure fn)
- **Nuevo**: `apps/core-api/src/application/ports/PidFormulaCatalog.ts` (`PidFormulaCatalog` interface)
- **Nuevo**: `apps/core-api/src/application/shared/pidFormulaSource.ts` (`PidFormulaSource` type)
- **Nuevo**: `apps/core-api/src/application/shared/pidDefinitionsToFormulaEntries.ts` (conversion fn)
- **Nuevo**: `apps/core-api/src/infrastructure/elm327/pidFormulaCatalog.ts` (`createPidFormulaCatalog` factory + `pidKey`)
- **Eliminado**: `apps/core-api/src/infrastructure/elm327/pidFormulas.ts` (contenido migrado)
- **Eliminado**: `apps/core-api/src/infrastructure/elm327/pidDefinitionMapper.ts` (contenido migrado)
- **Modificado**: `apps/core-api/src/infrastructure/elm327/elm327Adapter.ts` (actualizar imports)
- **Modificado**: `apps/core-api/src/infrastructure/elm327/hexUtils.ts` (eliminar `bigEndian`)
- **Nuevo**: `tests/unit/domain/bigEndian.test.ts` (tests de bigEndian movidos)
- **Nuevo**: `tests/unit/application/shared/pidDefinitionsToFormulaEntries.test.ts` (renombrado)
- **Renombrado**: `tests/unit/infrastructure/elm327/pidFormulas.test.ts` → `tests/unit/infrastructure/elm327/pidFormulaCatalog.test.ts`
- **Eliminado**: `tests/unit/infrastructure/elm327/pidDefinitionMapper.test.ts` (movido a application/shared)
