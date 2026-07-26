## Purpose

Infraestructura base para el catalogo auto-expansivo de la Fase 4: conexion a base de datos vectorial LanceDB embebida (sin servidor, zero infraestructura) y generacion de embeddings locales multilingues con transformers.js (sin API key, sin coste). Sirve como capa de persistencia vectorial para los cambios posteriores de busqueda semantica de PIDs, DTCs y memoria de diagnosticos.

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

### Requirement: Creacion de tablas con validacion Zod
El sistema SHALL proporcionar una funcion `ensureTable(db, name, columns)` que cree una tabla con el esquema dado si no existe, o la abra si ya existe (idempotente). Las columnas se validan con Zod.

#### Scenario: Tabla nueva con tipos validos
- **WHEN** se invoca `ensureTable(db, 'test', [{ name: 'id', type: 'string' }, { name: 'score', type: 'float32' }])`
- **AND** la tabla `test` no existe en la base de datos
- **THEN** se crea una tabla vacia con las columnas especificadas
- **AND** la funcion devuelve la referencia a la tabla creada

#### Scenario: Tabla existente (idempotencia)
- **WHEN** se invoca `ensureTable(db, 'test', columns)`
- **AND** la tabla `test` ya existe
- **THEN** la funcion abre la tabla existente sin intentar crearla de nuevo
- **AND** no se lanza error

#### Scenario: Tipo de columna no soportado
- **WHEN** se invoca `ensureTable` con una columna de tipo `'unsupported_type'`
- **THEN** Zod lanza un error de validacion indicando que el tipo no esta en el enum de tipos soportados

#### Scenario: Tipos soportados
- **WHEN** se usan columnas de tipo `string`, `float32`, `int32` y `boolean`
- **THEN** la validacion Zod pasa y la tabla se crea correctamente

---

### Requirement: Generacion de embeddings locales multilingues
El sistema SHALL proporcionar una funcion `createEmbedding(text)` en `infrastructure/persistence/vector/embedding.ts` que genere vectores de 384 dimensiones usando el modelo multilingue `Xenova/paraphrase-multilingual-MiniLM-L12-v2`.

#### Scenario: Vector de 384 dimensiones
- **WHEN** se invoca `createEmbedding('Engine Oil Pressure')`
- **THEN** la funcion devuelve un `number[]` de exactamente 384 elementos

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
