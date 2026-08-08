## Context

Rama `feat/rag-vector-repositories`. Fase 4 (Diagnóstico Cognitivo LLM). Stack: TypeScript ESM strict, Clean Architecture, Vitest. Suite actual: 404 tests verdes (29 ficheros).

Cambio **#1 de 3** del plan RAG auto-expansivo (ADR-007). Los otros dos: #2 sistema de confianza + validación OBD + 7 tools MCP, #3 inyección RAG en el caso de uso + auto-aprendizaje + wiring.

Estado de partida en `infrastructure/persistence/vector/`:
- `lancedb.ts` — `initLanceDb(dbPath?)` y `ensureTable(db, name, columns)`. Solo escalares, y con el bug de nombres de tipo descrito en `proposal.md`.
- `embedding.ts` — `createEmbedding(text)` → 384 dims, modelo `Xenova/paraphrase-multilingual-MiniLM-L12-v2`, cacheado perezosamente.

Ambos módulos están huérfanos: los únicos importadores son sus propios tests.

## Goals / Non-Goals

**Goals:**
- Corregir el mapeo de tipos de columna para que `string` y `boolean` funcionen de verdad
- Soportar columnas vectoriales `FixedSizeList(N, Float32)`
- Tres puertos de repositorio vectorial en la capa de aplicación, sin filtrar detalles de LanceDB
- Tres repositorios LanceDB que los implementen, sobre una factory compartida
- `LANCEDB_PATH` configurable
- Un test de integración real que demuestre que el esquema es válido

**Non-Goals:**
- No se inyecta contexto RAG en ningún prompt (Cambio #3)
- No se registra ninguna tool MCP (Cambio #2)
- No se implementa el sistema de confianza ni la validación OBD (Cambio #2)
- No se siembra corpus alguno: por decisión de producto solo se indexa conocimiento que la app no tenga físicamente; los PIDs del catálogo y los DTCs de escenarios son lógica existente
- No se toca `embedding.ts`

## Decisions

### 1. `apache-arrow` como dependencia explícita, no duck-typing

`sanitizeType` de LanceDB acepta dos formas: un string resuelto contra `constructorsByTypeName`, o un objeto duck-typed con `typeId` numérico. Para `FixedSizeList` haría falta la segunda, con `typeId: 16` a pelo.

Se descarta el duck-typing. `apache-arrow@18.1.0` ya está en el store de pnpm como peer de LanceDB y dentro de su rango declarado (`>=15.0.0 <=18.1.0`), así que declararlo en `package.json` cambia el lockfile pero **no descarga nada nuevo**. A cambio se gana código legible y tipado:

```ts
new Field('vector', new FixedSizeList(384, new Field('item', new Float32(), true)), false)
```

frente a un `{ typeId: 16, listSize: 384, children: [...] }` opaco que rompería en silencio si LanceDB cambia el sanitizador.

### 2. Sin índice vectorial

LanceDB resuelve por búsqueda exacta cuando no hay índice, y eso es correcto y sobradamente rápido para el volumen previsto: cientos o pocos miles de entradas. La propia documentación de LanceDB lo dice — por debajo de ~100K vectores el índice no aporta.

Una primera versión incluía `createVectorIndex()` con un umbral de 256 filas, "listo para cuando haga falta". Se ha eliminado: nada lo invocaba, el umbral estaba estimado y no medido, y `AGENTS.md` es explícito — *"KISS: sin abstracciones prematuras"*. Cuando exista volumen real que justifique un IVF-PQ se añadirá entonces, eligiendo el umbral con datos delante.

### 3. Costura `VectorStore`: la lógica reutilizable no vive dentro del adaptador

Un primer diseño puso la factory `createVectorRepository` en infraestructura, recibiendo directamente una `Table` de LanceDB. La capa de aplicación quedaba limpia —cumplía el contrato hexagonal— pero dejaba **~240 líneas de lógica genérica atrapadas dentro del adaptador**: embeber, validar, mapear y limitar no dependen del motor, y aun así habría que reescribirlas al cambiar de base vectorial.

El síntoma que lo delataba: la función que escapa comillas para SQL vivía en la factory "compartida". Escapar SQL es asunto del adaptador.

Se introduce un puerto de bajo nivel, `VectorStore`, con dos operaciones —`upsert` y `query`—. Por encima, `createVectorRepository` pasa a `application/services/` y habla solo con `VectorStore` y `EmbeddingGenerator`. Por debajo, `lanceVectorStore` concentra todo lo específico de LanceDB.

| | Se reescribe al cambiar de motor |
|---|---|
| Antes | ~515 líneas (240 de ellas, sin motivo) |
| Ahora | 362 líneas, solo `lancedb.ts` + `lanceVectorStore.ts` + `vectorTableConfigs.ts` |

313 líneas de puertos y servicios quedan intactas, y con ellas todos los consumidores de los cambios #2 y #3.

Efecto secundario: la guarda `assertVectorDimensions` baja al adaptador, que es donde está el peligro — el relleno silencioso es una peculiaridad de LanceDB, no un problema universal. Un adaptador de pgvector no la necesitaría.

### 4. El filtro cruza el puerto estructurado, nunca como cadena de consulta

`VectorQuery.filter` es `{ manufacturer?, model? }`. Cada adaptador lo traduce a lo suyo: predicado tipo SQL en LanceDB, `WHERE` en pgvector, objeto `where` en Chroma.

Si el puerto aceptara una cadena SQL ya montada, la fuga seguiría ahí, solo que disimulada: la capa de aplicación estaría hablando el dialecto de un motor concreto. Como consecuencia, el escapado de comillas simples es responsabilidad del adaptador, que es quien conoce la sintaxis.

### 4b. Los metadatos se restringen a escalares

`MetadataValue = string | number | boolean`. Es el mínimo común de los motores vectoriales: LanceDB usa columnas tipadas y pgvector, columnas SQL. Representar una lista pasa a ser una decisión explícita del mapeador —serializarla como JSON— en vez de una concesión implícita a LanceDB que cada adaptador tendría que adivinar.

### 5. Campos de lista serializados como texto

`diagnoses_index` necesita `symptoms` y `pids_involved`, que conceptualmente son listas. Arrow soporta `List`, pero añade complejidad de esquema y de mapeo para un beneficio nulo en este cambio: nadie filtra por elemento todavía.

Se guardan como texto JSON y se parsean en `fromRecord`. Si el Cambio #2 o #3 necesita filtrar por elemento, se migra entonces con el caso de uso real delante.

### 6. Nombres de puerto sin sufijo `Port`

El repositorio mezcla convenciones: los puertos de repositorio no llevan sufijo (`ObdRepository`, `UserRepository`, `VehicleRepository`) y los de servicio sí (`LlmClientPort`, `AuthServicePort`, `LoggerPort`). Los nuevos son repositorios, así que van sin sufijo.

### 7. El test de integración no toca el modelo de embeddings

El test real usa LanceDB embebido en un directorio temporal, pero inyecta vectores a mano en lugar de llamar a `createEmbedding`. Así prueba exactamente lo que debe probar —que el esquema es válido y que la búsqueda funciona— sin arrastrar la descarga de 118 MB del modelo ni convertir la suite en algo lento y dependiente de red.

## Risks / Trade-offs

| Riesgo | Mitigación |
|---|---|
| `apache-arrow` como dependencia directa puede desalinearse de la versión que espera LanceDB | Se fija dentro del rango que LanceDB declara como peer; pnpm avisa si se rompe la resolución |
| El test de integración es más lento que los unitarios | Solo un fichero, contra directorio temporal, sin red ni modelo. Se limpia en `afterAll` |
| Serializar listas como JSON impide filtrar por elemento | Aceptado: ningún consumidor lo necesita en este cambio. Se migra cuando haya caso real |
| La búsqueda por fuerza bruta degrada al crecer el corpus | `createVectorIndex()` queda disponible desde ya; se activa cuando el volumen lo pida |

## Migration Plan

Cambio aditivo salvo por la corrección de tipos en `ensureTable`. No hay datos en producción: `data/lancedb` no existe todavía porque nadie llamaba a estas funciones. Sin migración de datos ni compatibilidad hacia atrás que preservar.

## Open Questions

Ninguna. Alcance y decisiones de producto cerrados en el plan aprobado (Engram #158).
