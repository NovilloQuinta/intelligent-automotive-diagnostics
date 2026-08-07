## Why

El ADR-007 define un catálogo auto-expansivo: el agente descubre PIDs/DTCs desconocidos, los valida contra el vehículo y recuerda lo aprendido. Hoy la infraestructura vectorial existe pero está **huérfana** — `lancedb.ts` y `embedding.ts` no los importa nadie fuera de sus propios tests. No hay puertos, no hay repositorios, y `ExecuteCognitiveDiagnosisUseCase` construye el prompt sin ningún contexto recuperado.

Además, `ensureTable` **está roto**. Declara soportar `['string', 'float32', 'int32', 'boolean']`, pero LanceDB resuelve los nombres de tipo contra `constructorsByTypeName`, un diccionario que solo conoce `utf8` y `bool` — no `string` ni `boolean`. La cadena, verificada leyendo el paquete instalado:

```
ensureTable  (lancedb.ts:71)
  → db.createEmptyTable(name, schema)
  → makeEmptyTable(schema)          connection.js:168
  → makeArrowTable([], { schema })  arrow.js:647
  → sanitizeSchema(opt.schema)      arrow.js:339
  → sanitizeType('string')          sanitize.js:208
  → dataTypeFromName('string')      sanitize.js:466
  → throw "Unrecognized type name in schema: string"
```

El bug pasó desapercibido porque `lancedb.test.ts` mockea `@lancedb/lancedb` entero y afirma el esquema con `expect.any(Object)` — nunca comprueba que la forma sea válida. El spec vigente llega a documentar el bug como comportamiento correcto (escenario "Tipos soportados").

Las tres tablas del RAG necesitan columnas de texto (`manufacturer`, `model`, `source`, `text`), así que el bug bloquea el trabajo de inmediato. Se arregla aquí.

## What Changes

### 1. `lancedb.ts` — Tipos Arrow reales y columna vectorial

- Se declara `apache-arrow` como dependencia explícita de `core-api` y se mapean los tipos a clases reales: `string`→`Utf8`, `boolean`→`Bool`, `float32`→`Float32`, `int32`→`Int32`. Corrige el bug y elimina el casting opaco a `Parameters<typeof db.createEmptyTable>[1]`.
- Nueva `ensureVectorTable(db, name, { dimensions, columns })` — crea la columna `vector` como `FixedSizeList(dimensions, Field('item', Float32, true))` más las columnas de metadatos.
- Nueva `createVectorIndex(table, column, options)` — envuelve `table.createIndex()` con `Index.ivfPq()`, como **operación explícita** con guarda por número de filas.
- Se conservan sin cambios `initLanceDb`, la validación Zod y la idempotencia de `ensureTable`.

### 2. Puertos de aplicación

- `VectorRepository<TEntry>` — contrato de negocio: `index(entry)` y `search(query, options?)`.
- `PidVectorRepository`, `DtcVectorRepository`, `DiagnosisVectorRepository` — alias tipados sobre el anterior.
- **`VectorStore`** — puerto de bajo nivel con `upsert(records)` y `query({ vector, limit, filter })`. Es la única pieza que hay que reimplementar para cambiar de motor vectorial.
- **`EmbeddingGenerator`** — `embed(text)`, para que la aplicación no dependa del modelo concreto.

Cada fichero de puerto exporta un solo tipo, como el resto de puertos del proyecto; los datos viven en `application/dto/`.

### 3. Dominio y DTOs de conocimiento

- `KnowledgeSource` como **enum de dominio** en `domain/value-objects/knowledgeSource.ts`, siguiendo la convención de `Severity`. Describe procedencia, no es un objeto de transporte.
- `PidKnowledgeEntry`, `DtcKnowledgeEntry`, `DiagnosisKnowledgeEntry` en `application/dto/`, con `text` (lo que se embebe) más los metadatos del ADR-007 §3.
- `VehicleScope`, `VectorSearchOptions`, `VectorSearchResult`, `VectorRecord`, `VectorQuery`, `VectorMatch`.

### 4. Servicios de aplicación y adaptador

- `application/services/createVectorRepository.ts` — orquesta embeber, guardar y buscar hablando **solo con puertos**. Sin una sola referencia a LanceDB.
- `application/services/{pid,dtc,diagnosis}VectorRepository.ts` — los mapeos entrada ↔ metadatos, agnósticos del motor.
- `infrastructure/persistence/vector/lanceVectorStore.ts` — **el único módulo acoplado a LanceDB** en la cadena: provisión de tabla, traducción del filtro a predicado, escapado de literales y validación de dimensiones.
- `infrastructure/persistence/vector/vectorTableConfigs.ts` — esquema de las tres tablas.
- `infrastructure/persistence/vector/transformersEmbeddingGenerator.ts` — adaptador de embeddings.

### 5. Configuración

`LANCEDB_PATH` en el schema Zod de `configuration/index.ts`, con default `data/lancedb`.

### 6. Tests

- Unitarios por repositorio con tabla mockeada.
- **Test de integración contra LanceDB real** en directorio temporal (`fs.mkdtemp`): verifica que el esquema se acepta de verdad, que se insertan vectores y que la búsqueda por similitud devuelve resultados. Inyecta vectores directamente, sin invocar `createEmbedding`, para no arrastrar la descarga de 118 MB del modelo. Es lo único que habría cazado el bug de tipos.

## Lo que NO cambia

- `ExecuteCognitiveDiagnosisUseCase` — sigue sin contexto RAG (Cambio #3)
- `composition.ts` y el wiring — los repositorios se crean pero no se inyectan todavía (Cambio #3)
- `mcpServer.ts` — las 7 tools MCP llegan en el Cambio #2
- Sistema de confianza y validación OBD — Cambio #2
- `embedding.ts` — sin cambios
- `initLanceDb` — misma firma y mismo default `./data/lancedb`

## Capabilities

### Modified Capabilities
- `lancedb-infra`: los nombres de tipo de columna pasan a mapearse a clases Arrow reales, corrigiendo el fallo con `string` y `boolean`. Se añade soporte de columnas vectoriales `FixedSizeList` y creación explícita de índice IVF-PQ.

### Added Capabilities
- `vector-repositories`: puertos, servicios de aplicación y adaptador LanceDB para indexar y buscar por similitud semántica conocimiento de PIDs, DTCs y diagnósticos previos, con el motor vectorial confinado tras el puerto `VectorStore`.

## Impact

- **Modificado**: `apps/core-api/package.json` (añade `apache-arrow@18.1.0`)
- **Modificado**: `apps/core-api/src/infrastructure/persistence/vector/lancedb.ts` (73 → 196 líneas)
- **Modificado**: `apps/core-api/src/infrastructure/configuration/index.ts` (+1 línea)
- **Modificado**: `apps/core-api/tests/unit/infrastructure/persistence/vector/lancedb.test.ts`
- **Nuevo**: 6 puertos y 9 DTOs en `apps/core-api/src/application/`
- **Nuevo**: `apps/core-api/src/domain/value-objects/knowledgeSource.ts`
- **Nuevo**: `apps/core-api/src/application/services/` — 4 ficheros, 0 líneas acopladas al motor
- **Nuevo**: 3 ficheros en `apps/core-api/src/infrastructure/persistence/vector/`
- **Nuevo**: 2 tests de integración contra LanceDB real + unitarios de la factory y del adaptador
- **Sin cambios**: `embedding.ts`, `composition.ts`, `mcpServer.ts`, `ExecuteCognitiveDiagnosisUseCase.ts`

**Superficie de un cambio de motor vectorial**: 362 líneas (`lancedb.ts`, `lanceVectorStore.ts`, `vectorTableConfigs.ts`). Las 313 líneas de puertos y servicios quedan intactas, verificado con `grep`: la capa de aplicación no menciona LanceDB ni Arrow en ningún punto.
