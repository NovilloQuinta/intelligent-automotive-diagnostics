## 0. Preparación

- [x] 0.1 Crear rama `feat/rag-vector-repositories` desde `main`
- [x] 0.2 Verificar baseline: 499 tests verdes en 41 ficheros, lint/format/build OK
- [x] 0.3 Cargar contexto: ADR-007, spec `lancedb-infra`, plan aprobado

## 1. Dependencias y configuración

- [x] 1.1 `apache-arrow` fijado a `18.1.0` exacto en `apps/core-api/package.json` — LanceDB declara el peer como `<=18.1.0`, asi que un `^18.1.0` podria resolver a 18.2 y salirse del rango
- [x] 1.2 `pnpm install --offline` → `downloaded 0`, confirmado que no hubo descarga
- [x] 1.3 RED: `tests/unit/infrastructure/configuration/loadConfig.test.ts` (3 tests en rojo)
- [x] 1.4 GREEN: `LANCEDB_PATH: z.string().min(1).default('data/lancedb')` — `.min(1)` porque el default de Zod no cubre la cadena vacia
- [x] 1.5 Actualizado `makeConfig` de `assertProductionSecrets.test.ts`, que dejaba de compilar al ganar `AppConfig` un campo obligatorio

## 2. `lancedb.ts` — Corregir el mapeo de tipos

- [x] 2.1 RED: test de integracion contra LanceDB real → falla con `Unrecognized type name in schema: string`, confirmando el bug deducido leyendo el paquete
- [x] 2.2 GREEN: `ARROW_TYPE_BY_NAME` mapea a `Utf8`/`Float32`/`Int32`/`Bool`; se construye un `Schema` real y se elimina el cast `as Parameters<...>`
- [x] 2.3 Sustituido `expect.any(Object)` por aserciones sobre el `Schema` — esa asercion laxa era justo lo que ocultaba el fallo

## 3. `ensureVectorTable` y `createVectorIndex`

- [x] 3.1 `ensureVectorTable` con columna `vector` como `FixedSizeList(dimensions, Field('item', Float32, true))`
- [x] 3.2 Insercion y recuperacion por similitud verificadas contra LanceDB real
- [x] 3.3 `createVectorIndex` con guarda por `countRows()`; `MIN_ROWS_FOR_VECTOR_INDEX = 256`
- [x] 3.4 Extraido `openOrCreate` para compartir la idempotencia entre ambas funciones
- [x] 3.5 **Desviacion**: se esperaba que LanceDB rechazara un vector de dimension incorrecta. **No lo hace** — rellena con `null` o trunca, en silencio y sin error. Verificado empiricamente. Se anadio `assertVectorDimensions()` y el test pasa a documentar el comportamiento real

## 4. Puertos y DTOs

- [x] 4.1 `ports/VectorRepository.ts` — `VectorSearchResult<T>`, `VehicleScope`, `VectorSearchOptions`
- [x] 4.2 `dto/KnowledgeSource.ts` — union `web | mechanic | previous_diagnosis | obd_validated` (ADR-007 §4)
- [x] 4.3 `dto/PidKnowledgeEntry.ts`, `dto/DtcKnowledgeEntry.ts`, `dto/DiagnosisKnowledgeEntry.ts`
- [x] 4.4 `ports/{Pid,Dtc,Diagnosis}VectorRepository.ts` como alias de `VectorRepository<T>` — evita interfaces vacias que ESLint marcaria
- [x] 4.5 **Decision**: el resultado expone `distance` (menor = mas parecido) en lugar de `score`. LanceDB devuelve `_distance`; llamarlo `score` sugeriria que mayor es mejor

## 5. Factory `createVectorRepository`

- [x] 5.1 RED: 10 tests unitarios con tabla mockeada
- [x] 5.2 GREEN: `createVectorRepository<TEntry>({ table, toRecord, fromRecord, ... })`
- [x] 5.3 Escapado de comillas simples en los predicados, con test que intenta inyectar `O'Neil' OR 1=1 --`
- [x] 5.4 `embed` inyectable, para testear sin cargar el modelo de 118 MB
- [x] 5.5 **Ajuste de diseño**: la factory pone la columna `vector`; los mappers solo producen metadatos. Asi ningun repositorio concreto puede equivocarse con el nombre de la columna

## 6. Los 3 repositorios concretos

- [x] 6.1 `pidVectorRepository.ts` → `pids_index`
- [x] 6.2 `dtcVectorRepository.ts` → `dtcs_index`
- [x] 6.3 `diagnosisVectorRepository.ts` → `diagnoses_index`, con `symptoms` y `pidsInvolved` serializados como JSON
- [x] 6.4 Test de integracion extremo a extremo de los tres contra LanceDB real, con embedding determinista inyectado

## 7. Costura `VectorStore` (tras revision del usuario)

La revision señalo que, aunque la capa de aplicacion estaba limpia, la logica reutilizable quedaba atrapada dentro del adaptador: cambiar de motor vectorial habria obligado a reescribir ~240 lineas que no dependen del motor. Se introduce el puerto de bajo nivel.

- [x] 7.1 `KnowledgeSource` movido a `domain/value-objects/knowledgeSource.ts` como enum de string — describe procedencia, no es un DTO
- [x] 7.2 `VectorRepository.ts` reducido a un solo export; `VehicleScope`, `VectorSearchOptions` y `VectorSearchResult` a `application/dto/`, como el resto de puertos del proyecto
- [x] 7.3 Nuevos puertos `VectorStore` y `EmbeddingGenerator`, con sus DTOs `VectorRecord`, `VectorQuery` y `VectorMatch`
- [x] 7.4 `MetadataValue = string | number | boolean` — el minimo comun de los motores vectoriales. El compilador cazo el mapeador que aun prometia `unknown`
- [x] 7.5 `createVectorRepository` movido a `application/services/`, ya sin LanceDB, con `TEntry extends EmbeddableEntry` que elimina el cast de `extractText`
- [x] 7.6 Los 3 repositorios movidos a `application/services/` como mapeos agnosticos
- [x] 7.7 `lanceVectorStore.ts` creado: unico modulo acoplado al motor. Se lleva el escapado de comillas, que estaba mal ubicado en la factory "compartida"
- [x] 7.8 `assertVectorDimensions` baja al adaptador — el relleno silencioso es peculiaridad de LanceDB, no un problema universal
- [x] 7.9 `vectorTableConfigs.ts` y `transformersEmbeddingGenerator.ts`
- [x] 7.10 Tests reubicados: el de la factory mockea un `VectorStore` de dos metodos en vez de la API fluida de LanceDB; nuevo unitario del adaptador; integracion de extremo a extremo que verifica el contrato entre `toMetadata` y las columnas
- [x] 7.11 Verificado con `grep`: `src/application/` no menciona `@lancedb`, `apache-arrow` ni `infrastructure/`

**Superficie de cambio de motor**: 362 lineas (`lancedb.ts` 196 + `lanceVectorStore.ts` 113 + `vectorTableConfigs.ts` 53). Sobreviven 313 lineas de puertos y servicios.

## 8. Cierre

- [x] 8.1 REFACTOR: `openOrCreate` extraido, tipos compartidos colocados en su modulo
- [x] 8.2 `pnpm lint && pnpm format && pnpm test && pnpm build` — los cuatro en verde
- [x] 8.3 539 tests verdes en 46 ficheros (baseline 499 + 40 nuevos), cero regresiones
- [x] 8.4 Actualizar SESION ACTUAL en `AGENTS.md`
- [x] 8.5 Guardar resumen en Engram
- [ ] 8.6 **Preguntar antes de commitear** (regla 7)

## Hallazgos fuera de alcance

- **`pnpm test:coverage` esta roto en `main` desde el 5 de agosto**, no por este cambio. El override `brace-expansion: '>=5.0.9'` de `a6797d9` (hardening de CVEs) rompe `minimatch@9`, que espera la forma CommonJS previa: `TypeError: (0 , brace_expansion_1.default) is not a function`. Paso desapercibido porque CI solo ejecuta `pnpm test`. Arreglarlo implica revisar un override de seguridad, asi que merece su propio cambio.
- `CLAUDE.md` declara 404 tests en 29 ficheros y un `application/ports/cognitiveDiagnosis.port.ts` que no existe; no hay ningun `*.port.ts` en el repositorio.
