# multi-ecu-discovery

## ADDED Requirements

### Requirement: El barrido del bus descubre todas las ECUs que responden

El sistema SHALL descubrir cada ECU que conteste al broadcast de descubrimiento, no solo
la primera, siempre que su dirección de respuesta caiga en el rango legislado
ISO 15765-4 (`7E8`–`7EF`).

#### Scenario: Un bus con cinco ECUs devuelve cinco nodos
- **GIVEN** un vehículo cuyo bus responde al broadcast `01 00` desde 7E8, 7E9, 7EA, 7EB y 7ED
- **WHEN** el mecánico ejecuta el descubrimiento de ECUs
- **THEN** el sistema devuelve cinco ECUs, una por dirección
- **AND** el mapa de topología dibuja un nodo por cada una

#### Scenario: Las direcciones fuera del rango legislado se descartan
- **GIVEN** un bus donde además responde una ECU en `7B8` (ABS, fuera de ISO 15765-4)
- **WHEN** se ejecuta el descubrimiento
- **THEN** esa dirección no aparece entre las ECUs descubiertas

### Requirement: Las ECUs no catalogadas se presentan como desconocidas

El sistema SHALL presentar como desconocida toda ECU cuya dirección no esté en el
catálogo, en lugar de omitirla o inventarle un nombre. Solo `7E8` (Engine Control
Module) está estandarizada por ISO 15765-4.

#### Scenario: Una ECU sin catalogar conserva su dirección
- **GIVEN** una ECU que responde desde `7E9`, ausente del catálogo
- **WHEN** se ejecuta el descubrimiento
- **THEN** se devuelve con su dirección de respuesta y tipo desconocido
- **AND** el mecánico puede verla en el mapa aunque no tenga nombre

### Requirement: El agente aprende las ECUs que no reconoce

El sistema SHALL instruir al agente para que, ante una ECU cuyo nombre no reconozca,
consulte el catálogo de conocimiento y persista lo que resuelva, de modo que la
siguiente vez esté disponible sin volver a resolverla.

#### Scenario: Una ECU desconocida queda aprendida
- **GIVEN** un diagnóstico cognitivo sobre un vehículo con una ECU no catalogada
- **WHEN** el agente consulta las ECUs del bus
- **THEN** busca esa dirección en el catálogo de conocimiento
- **AND** persiste la definición que resuelve, asociada a fabricante y modelo

#### Scenario: Lo aprendido se recupera en el siguiente diagnóstico
- **GIVEN** una ECU ya aprendida para un fabricante y modelo
- **WHEN** se diagnostica otro vehículo del mismo fabricante y modelo
- **THEN** el agente la recupera del catálogo sin volver a resolverla

### Requirement: Cada avería se atribuye a la ECU que la reporta

El sistema SHALL registrar, para cada código de avería leído del bus, qué ECU lo
reporta, y SHALL señalarlo en el mapa de topología.

#### Scenario: El mapa marca la ECU averiada
- **GIVEN** un bus donde la ECU `7E9` reporta un código y las demás no
- **WHEN** el mecánico consulta el mapa de topología
- **THEN** el nodo de `7E9` aparece marcado como averiado
- **AND** los nodos de las demás ECUs no

#### Scenario: Un código sin origen sigue siendo válido
- **GIVEN** una lectura de códigos en la que el vehículo no devuelve la dirección de origen
- **WHEN** se procesa la respuesta
- **THEN** los códigos se devuelven igualmente, sin ECU asociada
- **AND** el mapa no marca ningún nodo como averiado
