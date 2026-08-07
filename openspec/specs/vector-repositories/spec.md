## Purpose

Puertos, indices de conocimiento y adaptador para indexar y buscar por similitud semantica el conocimiento auto-expansivo del ADR-007: definiciones de PIDs propietarios, codigos DTC especificos de fabricante y casos de diagnostico resueltos. El motor vectorial queda confinado tras el puerto `VectorStore`, de modo que cambiarlo no toque ni la capa de aplicacion ni la logica de orquestacion.

## Requirements

### Requirement: Puertos de repositorio de conocimiento
El sistema SHALL definir en `application/ports/` los puertos `PidVectorRepository`, `DtcVectorRepository` y `DiagnosisVectorRepository`, cada uno con `index(entry)` y `search(query, options?)`. Ningun fichero de la capa de aplicacion SHALL referenciar el motor vectorial ni la libreria de embeddings.

#### Scenario: Independencia del motor
- **WHEN** se inspecciona `src/application/` completo
- **THEN** no aparece ninguna referencia a `@lancedb/lancedb` ni a `apache-arrow`
- **AND** tampoco ninguna importacion desde `infrastructure/`

#### Scenario: Resultado de busqueda tipado
- **WHEN** se invoca `search(query)`
- **THEN** se devuelve `VectorSearchResult<TEntry>[]`, con la entrada de dominio y su distancia
- **AND** la distancia es menor cuanto mas parecido es el resultado

---

### Requirement: Puerto de almacen vectorial
El sistema SHALL definir un puerto `VectorStore` con `upsert(records)` y `query({ vector, limit, filter })`. El filtro SHALL viajar estructurado —fabricante y modelo opcionales— y NO SHALL expresarse como cadena de consulta de ningun motor.

#### Scenario: Filtro estructurado
- **WHEN** la capa de aplicacion acota una busqueda por fabricante
- **THEN** entrega `filter: { manufacturer: 'Audi' }` al almacen
- **AND** no construye ningun predicado ni fragmento de consulta

#### Scenario: Traduccion en el adaptador
- **WHEN** el adaptador de LanceDB recibe esa consulta
- **THEN** la traduce a su predicado `manufacturer = 'Audi'`
- **AND** la traduccion es responsabilidad exclusiva del adaptador

---

### Requirement: Metadatos escalares
Los metadatos de un `VectorRecord` SHALL restringirse a `string`, `number` o `boolean`. Representar valores compuestos SHALL ser decision explicita del mapeador, no del adaptador.

#### Scenario: Lista serializada por el mapeador
- **WHEN** se indexa un caso de diagnostico con listas de sintomas y de PIDs
- **THEN** el mapeador las serializa como JSON antes de entregarlas al almacen
- **AND** las reconstruye al leer
- **AND** el adaptador nunca decide como representar una lista

---

### Requirement: Indice de conocimiento agnostico del motor
El sistema SHALL proporcionar `createKnowledgeIndex` en `application/knowledge/`, que orqueste embeber, guardar y buscar apoyandose unicamente en los puertos `VectorStore` y `EmbeddingGenerator`. Los tres mapeadores (`pidKnowledgeMapper`, `dtcKnowledgeMapper`, `diagnosisKnowledgeMapper`) viven junto a el, sin una sola referencia a LanceDB.

#### Scenario: Indexado de una entrada
- **WHEN** se invoca `index(entry)`
- **THEN** se genera el embedding de `entry.embeddedText` mediante el `EmbeddingGenerator`
- **AND** se invoca `upsert` con el vector y los metadatos producidos por `toMetadata`

#### Scenario: Busqueda por similitud
- **WHEN** se invoca `search('presion de aceite baja')`
- **THEN** se genera el embedding de la consulta
- **AND** se invoca `query` con el limite aplicable y el filtro sin transformar
- **AND** cada coincidencia se convierte a entrada de dominio con `fromMetadata`

#### Scenario: Limite por defecto
- **WHEN** se invoca `search(query)` sin `limit`
- **THEN** se aplica `DEFAULT_SEARCH_LIMIT`

---

### Requirement: Adaptador LanceDB
El sistema SHALL implementar `createLanceVectorStore(db, config)` en `infrastructure/persistence/vector/`, que cumpla `VectorStore` sobre LanceDB, aprovisione su tabla y concentre todo lo especifico del motor.

#### Scenario: Escapado de literales
- **WHEN** se consulta con un valor de filtro que contiene una comilla simple
- **THEN** la comilla se escapa duplicandola
- **AND** el predicado sigue siendo sintacticamente valido
- **AND** el valor se trata como dato, sin alterar la estructura de la consulta

#### Scenario: Validacion de dimensiones en el adaptador
- **WHEN** se intenta guardar un vector cuya longitud no coincide con la columna
- **THEN** el adaptador lanza un error antes de tocar la tabla
- **AND** la comprobacion vive aqui porque el relleno silencioso es una peculiaridad de LanceDB, no un problema universal

#### Scenario: Separacion de metadatos
- **WHEN** se recuperan filas de LanceDB
- **THEN** las columnas propias del motor —el vector y la distancia— se excluyen de los metadatos devueltos

---

### Requirement: Repositorios concretos por tipo de conocimiento
El sistema SHALL implementar los tres repositorios sobre `pids_index`, `dtcs_index` y `diagnoses_index`, con los metadatos definidos en el ADR-007.

#### Scenario: Metadatos de PIDs
- **WHEN** se indexa una entrada de PID
- **THEN** se persisten `manufacturer`, `model`, `confidence`, `source` y `obdValidated`

#### Scenario: Metadatos de DTCs
- **WHEN** se indexa una entrada de DTC
- **THEN** se persisten `manufacturer`, `model`, `confidence` y `source`

#### Scenario: Metadatos de diagnosticos
- **WHEN** se indexa un caso de diagnostico
- **THEN** se persisten `manufacturer`, `model`, `symptoms` y `pidsInvolved`

#### Scenario: Contrato entre mapeadores y esquema
- **WHEN** se ejecuta el test de integracion de los tres repositorios contra LanceDB real
- **THEN** se verifica que las claves producidas por `toMetadata` existen como columnas en la tabla
- **AND** que una entrada indexada se recupera con todos sus campos intactos
