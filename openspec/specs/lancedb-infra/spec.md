## Purpose

Infraestructura base para el catalogo auto-expansivo de la Fase 4: conexion a base de datos vectorial LanceDB embebida (sin servidor, zero infraestructura) y generacion de embeddings locales multilingues con transformers.js (sin API key, sin coste). Los tipos de columna se mapean a clases Arrow reales, y las tablas exponen una columna vectorial `FixedSizeList` para busqueda por similitud. Sirve como capa de persistencia vectorial para la busqueda semantica de PIDs, DTCs y memoria de diagnosticos.

## Requirements

### Requirement: Conexion a LanceDB embebida
El sistema SHALL implementar una factory function `initLanceDb(dbPath?)` en `infrastructure/persistence/vector/lancedb.ts` que conecte a una base de datos LanceDB embebida en disco.

#### Scenario: Conexion con ruta personalizada
- **WHEN** se invoca `initLanceDb('/tmp/test-lancedb')`
- **THEN** se establece una conexion a LanceDB en el directorio indicado
- **AND** la funcion devuelve `{ db: Connection, tableNames: string[] }` con las tablas existentes

#### Scenario: Conexion con ruta por defecto
- **WHEN** se invoca `initLanceDb()` sin parametro
- **THEN** la conexion se establece en el directorio `./data/lancedb`

---

### Requirement: Creacion de tablas vectoriales con validacion Zod
El sistema SHALL proporcionar una funcion `ensureVectorTable(db, name, { dimensions, columns })` que cree una tabla con una columna `vector` de tipo `FixedSizeList(dimensions, Field('item', Float32, true))` ademas de las columnas de metadatos indicadas. Las opciones se validan con Zod y los tipos de columna SHALL mapearse a clases de `apache-arrow` reales, no a nombres de tipo en texto plano. La funcion SHALL ser idempotente.

El motivo del mapeo explicito: LanceDB resuelve los nombres de tipo en texto contra un diccionario interno que solo conoce `utf8` y `bool`. Pasar `'string'` o `'boolean'` provocaba `Unrecognized type name in schema`.

#### Scenario: Tabla vectorial nueva
- **WHEN** se invoca `ensureVectorTable(db, 'pids_index', { dimensions: 384, columns: [{ name: 'embeddedText', type: 'string' }] })`
- **AND** la tabla no existe
- **THEN** se crea con una columna `vector` de tipo `FixedSizeList` de tamano 384 y elementos `Float32`
- **AND** se crea la columna `embeddedText` de tipo `Utf8`

#### Scenario: Los cuatro tipos soportados crean tabla contra LanceDB real
- **GIVEN** una base de datos LanceDB embebida en un directorio temporal
- **WHEN** se invoca `ensureVectorTable` con columnas de tipo `string`, `float32`, `int32` y `boolean`
- **THEN** la tabla se crea sin error
- **AND** el esquema resultante expone los tipos Arrow `Utf8`, `Float32`, `Int32` y `Bool` respectivamente
- **AND** la verificacion se realiza contra una instancia real de LanceDB, no contra un mock

#### Scenario: Tipo de columna no soportado
- **WHEN** se invoca `ensureVectorTable` con una columna de tipo `'unsupported_type'`
- **THEN** Zod lanza un error de validacion indicando que el tipo no esta en el enum de tipos soportados

#### Scenario: Idempotencia de la tabla vectorial
- **WHEN** se invoca `ensureVectorTable` sobre una tabla que ya existe
- **THEN** se abre la existente sin recrearla ni lanzar error

#### Scenario: Insercion y recuperacion por similitud
- **GIVEN** una tabla vectorial de 384 dimensiones creada contra LanceDB real
- **WHEN** se insertan varias filas con sus vectores y metadatos
- **AND** se busca con un vector de consulta limitando a 3 resultados
- **THEN** se devuelven como maximo 3 filas
- **AND** vienen ordenadas por distancia ascendente, con la mas parecida primero

---

### Requirement: Validacion explicita de dimensiones
El sistema SHALL proporcionar `assertVectorDimensions(vector, dimensions)`, que lance un error cuando la longitud del vector no coincida con la de la columna.

La comprobacion es necesaria porque LanceDB 0.31 no valida la dimension: rellena con `null` un vector corto y trunca uno largo, en ambos casos en silencio. Un vector con `null` produce similitudes basura.

#### Scenario: Dimension incorrecta
- **WHEN** se intenta insertar un vector cuya longitud no coincide con `dimensions`
- **THEN** se lanza un error que indica la dimension esperada y la recibida

---

### Requirement: Sin indice vectorial
El sistema NO SHALL crear indice alguno sobre la columna vectorial. LanceDB resuelve por busqueda exacta, correcta y de sobra rapida para el corpus previsto.

Un indice IVF-PQ se anadira cuando exista volumen real que lo justifique, eligiendo entonces el umbral de entrenamiento con datos medidos en lugar de estimados.

#### Scenario: Busqueda sin indice
- **GIVEN** una tabla vectorial recien creada
- **WHEN** se insertan entradas y se busca por similitud
- **THEN** se devuelven los resultados correctos ordenados por distancia
- **AND** no ha hecho falta construir ningun indice

---

### Requirement: Generacion de embeddings locales multilingues
El sistema SHALL proporcionar una funcion `createEmbedding(text)` en `infrastructure/persistence/vector/embedding.ts` que genere vectores de 384 dimensiones usando el modelo multilingue `Xenova/paraphrase-multilingual-MiniLM-L12-v2`.

#### Scenario: Vector de 384 dimensiones
- **WHEN** se invoca `createEmbedding('Engine Oil Pressure')`
- **THEN** la funcion devuelve un `number[]` de exactamente 384 elementos
- **AND** se toma la primera fila del tensor, porque este conserva la dimension de lote

#### Scenario: Normalizacion L2 delegada al pipeline
- **WHEN** se genera un embedding
- **THEN** el pipeline de transformers.js se invoca con `{ pooling: 'mean', normalize: true }` para que el vector resultante tenga norma L2 = 1

#### Scenario: Lazy loading del modelo
- **WHEN** se invoca `createEmbedding` por primera vez
- **THEN** se carga el pipeline `feature-extraction` con el modelo multilingue
- **AND** en invocaciones posteriores se reutiliza la instancia cacheada sin recargar el modelo

#### Scenario: Texto vacio
- **WHEN** se invoca `createEmbedding('')`
- **THEN** se lanza un error con mensaje `'El texto no puede estar vacio'`

#### Scenario: Texto en español
- **WHEN** se invoca `createEmbedding('Presion de aceite del motor')`
- **THEN** la funcion devuelve un vector de 384 dimensiones sin errores
