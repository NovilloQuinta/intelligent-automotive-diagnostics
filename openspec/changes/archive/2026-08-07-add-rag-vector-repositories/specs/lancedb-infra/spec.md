# LanceDB Infra

## Purpose

Infraestructura base para el catalogo auto-expansivo de la Fase 4: conexion a base de datos vectorial LanceDB embebida (sin servidor, zero infraestructura) y generacion de embeddings locales multilingues con transformers.js (sin API key, sin coste). Los tipos de columna se mapean a clases Arrow reales, y se soportan columnas vectoriales `FixedSizeList` para busqueda por similitud.

## MODIFIED Requirements

### Requirement: Creacion de tablas con validacion Zod (MODIFIED)
El sistema SHALL proporcionar una funcion `ensureTable(db, name, columns)` que cree una tabla con el esquema dado si no existe, o la abra si ya existe (idempotente). Las columnas se validan con Zod y sus tipos SHALL mapearse a clases de `apache-arrow` reales, no a nombres de tipo en texto plano.

El motivo del cambio: LanceDB resuelve los nombres de tipo en texto contra un diccionario interno que solo conoce `utf8` y `bool`. Pasar `'string'` o `'boolean'` provocaba `Unrecognized type name in schema`. El requisito anterior afirmaba que esos cuatro tipos funcionaban, lo cual era falso para dos de ellos.

#### Scenario: Tabla nueva con tipos validos
- **WHEN** se invoca `ensureTable(db, 'test', [{ name: 'id', type: 'string' }, { name: 'score', type: 'float32' }])`
- **AND** la tabla `test` no existe en la base de datos
- **THEN** se construye un `Schema` de Arrow con `Field('id', Utf8)` y `Field('score', Float32)`
- **AND** se crea una tabla vacia con ese esquema
- **AND** la funcion devuelve la referencia a la tabla creada

#### Scenario: Tabla existente (idempotencia)
- **WHEN** se invoca `ensureTable(db, 'test', columns)`
- **AND** la tabla `test` ya existe
- **THEN** la funcion abre la tabla existente sin intentar crearla de nuevo
- **AND** no se lanza error

#### Scenario: Tipo de columna no soportado
- **WHEN** se invoca `ensureTable` con una columna de tipo `'unsupported_type'`
- **THEN** Zod lanza un error de validacion indicando que el tipo no esta en el enum de tipos soportados

#### Scenario: Los cuatro tipos soportados crean tabla contra LanceDB real
- **GIVEN** una base de datos LanceDB embebida en un directorio temporal
- **WHEN** se invoca `ensureTable` con columnas de tipo `string`, `float32`, `int32` y `boolean`
- **THEN** la tabla se crea sin error
- **AND** el esquema resultante expone los tipos Arrow `Utf8`, `Float32`, `Int32` y `Bool` respectivamente
- **AND** la verificacion se realiza contra una instancia real de LanceDB, no contra un mock

## ADDED Requirements

### Requirement: Creacion de tablas con columna vectorial
El sistema SHALL proporcionar una funcion `ensureVectorTable(db, name, { dimensions, columns })` que cree una tabla con una columna `vector` de tipo `FixedSizeList(dimensions, Field('item', Float32, true))` ademas de las columnas de metadatos indicadas. La funcion SHALL ser idempotente.

#### Scenario: Tabla vectorial nueva
- **WHEN** se invoca `ensureVectorTable(db, 'pids_index', { dimensions: 384, columns: [{ name: 'text', type: 'string' }] })`
- **AND** la tabla no existe
- **THEN** se crea con una columna `vector` de tipo `FixedSizeList` de tamano 384 y elementos `Float32`
- **AND** se crea la columna `text` de tipo `Utf8`

#### Scenario: Insercion y recuperacion por similitud
- **GIVEN** una tabla vectorial de 384 dimensiones creada contra LanceDB real
- **WHEN** se insertan varias filas con sus vectores y metadatos
- **AND** se busca con un vector de consulta limitando a 3 resultados
- **THEN** se devuelven como maximo 3 filas
- **AND** vienen ordenadas por distancia ascendente, con la mas parecida primero

#### Scenario: Dimension incorrecta
- **WHEN** se intenta insertar un vector cuya longitud no coincide con `dimensions`
- **THEN** se lanza un error

#### Scenario: Idempotencia de la tabla vectorial
- **WHEN** se invoca `ensureVectorTable` sobre una tabla que ya existe
- **THEN** se abre la existente sin recrearla ni lanzar error

---

### Requirement: Sin indice vectorial
El sistema NO SHALL crear indice alguno sobre la columna vectorial en este cambio. LanceDB resuelve por busqueda exacta, correcta y de sobra rapida para el corpus previsto.

Un indice IVF-PQ se anadira cuando exista volumen real que lo justifique, eligiendo entonces el umbral de entrenamiento con datos medidos en lugar de estimados.

#### Scenario: Busqueda sin indice
- **GIVEN** una tabla vectorial recien creada
- **WHEN** se insertan entradas y se busca por similitud
- **THEN** se devuelven los resultados correctos ordenados por distancia
- **AND** no ha hecho falta construir ningun indice
