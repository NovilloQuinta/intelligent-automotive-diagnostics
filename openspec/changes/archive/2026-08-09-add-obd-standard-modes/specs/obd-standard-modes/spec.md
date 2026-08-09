# OBD Standard Modes

## Purpose

Modos estándar SAE J1979 que faltaban en la aplicación: borrado de códigos de avería (Mode 04), estado del testigo del motor (Mode 01 PID 01) y lectura de averías pendientes (Mode 07) y permanentes (Mode 0A).

## Requirements

### Requirement: Borrado de códigos de avería
El sistema SHALL exponer `POST /api/clear-dtc`, que envía el Mode 04 al vehículo mediante `clearDtcCodes()`, ya implementado en el adaptador.

#### Scenario: Borrado con éxito
- **GIVEN** un vehículo con averías almacenadas
- **WHEN** se hace `POST /api/clear-dtc` con un `scenarioId` válido
- **THEN** se envía `04` al vehículo
- **AND** responde 200 indicando que la operación se aceptó

#### Scenario: Escenario inexistente
- **GIVEN** un `scenarioId` que no corresponde a ningún escenario
- **WHEN** se hace `POST /api/clear-dtc`
- **THEN** responde 404

#### Scenario: Falta el escenario en modo docker
- **GIVEN** el servidor en modo docker
- **WHEN** se hace `POST /api/clear-dtc` sin `scenarioId`
- **THEN** responde 400

#### Scenario: El vehículo rechaza el borrado
- **GIVEN** un vehículo que responde con error negativo al Mode 04
- **WHEN** se hace `POST /api/clear-dtc`
- **THEN** responde con un error que distingue el rechazo del vehículo de un fallo de comunicación

---

### Requirement: Confirmación explícita antes de borrar
El sistema SHALL pedir confirmación antes de borrar, informando de las consecuencias concretas de la operación.

#### Scenario: El usuario pulsa borrar
- **GIVEN** el panel de DTC con averías
- **WHEN** el usuario pulsa el botón de borrar
- **THEN** se muestra un diálogo que advierte de que se pierden las averías almacenadas y su freeze frame
- **AND** advierte de que las averías permanentes no se borran con esta operación
- **AND** no se emite ninguna petición hasta que el usuario confirma

#### Scenario: El usuario cancela
- **GIVEN** el diálogo de confirmación abierto
- **WHEN** el usuario cancela
- **THEN** no se emite ninguna petición y el panel queda como estaba

#### Scenario: Refresco tras borrar
- **GIVEN** un borrado confirmado y aceptado por el vehículo
- **WHEN** la operación termina
- **THEN** se vuelve a leer el estado del vehículo para reflejar la situación posterior

---

### Requirement: Estado del testigo del motor
El sistema SHALL leer el Mode 01 PID 01 y exponer `GET /api/vehicle-status` con el estado del testigo del motor y el número de averías almacenadas.

#### Scenario: Testigo encendido
- **GIVEN** un vehículo cuyo byte A del PID 01 tiene el bit 7 activo
- **WHEN** se hace `GET /api/vehicle-status`
- **THEN** responde 200 indicando que el testigo está encendido
- **AND** el número de averías corresponde a los bits 0-6 del mismo byte

#### Scenario: Testigo apagado
- **GIVEN** un vehículo con el bit 7 del byte A a cero
- **WHEN** se hace `GET /api/vehicle-status`
- **THEN** responde 200 indicando que el testigo está apagado

#### Scenario: El estado se lee, no se deduce
- **GIVEN** un vehículo que devuelve una avería en Mode 03 pero el testigo apagado en el PID 01
- **WHEN** se consulta el estado
- **THEN** se informa del testigo apagado, sin deducirlo de la presencia de averías

#### Scenario: PID no soportado
- **GIVEN** un vehículo que responde `NO DATA` al `01 01`
- **WHEN** se consulta el estado
- **THEN** se informa de que el dato no está disponible, sin inventar un valor por defecto

---

### Requirement: Lectura de averías pendientes y permanentes
El sistema SHALL leer los modos 07 y 0A reutilizando el parser de DTCs existente y resolviendo la descripción contra el catálogo.

#### Scenario: Averías pendientes
- **GIVEN** un vehículo con una avería detectada y aún no confirmada
- **WHEN** se lee el Mode 07
- **THEN** se devuelve la lista de códigos pendientes con su descripción del catálogo

#### Scenario: Averías permanentes
- **GIVEN** un vehículo con una avería confirmada
- **WHEN** se lee el Mode 0A
- **THEN** se devuelve la lista de códigos permanentes con su descripción del catálogo

#### Scenario: Sin averías en un modo
- **GIVEN** un vehículo sin averías pendientes
- **WHEN** se lee el Mode 07
- **THEN** se devuelve una lista vacía, no un error

#### Scenario: Modo no soportado por el vehículo
- **GIVEN** un vehículo que responde `NO DATA` al Mode 0A
- **WHEN** se lee
- **THEN** se distingue "no soportado" de "lista vacía"

#### Scenario: El parser no se duplica
- **GIVEN** la misma trama de bytes de DTC
- **WHEN** se procesa como Mode 03, Mode 07 o Mode 0A
- **THEN** se obtienen los mismos códigos, resueltos por la misma función de parseo

---

### Requirement: Panel con las tres listas de averías
El sistema SHALL mostrar las averías almacenadas, pendientes y permanentes en tres secciones diferenciadas, cada una con su explicación.

#### Scenario: Vehículo con averías en las tres listas
- **GIVEN** un vehículo con almacenadas, pendientes y permanentes
- **WHEN** se muestra el panel de DTC
- **THEN** aparecen las tres secciones, cada una con sus códigos y descripciones
- **AND** cada sección explica brevemente qué significa esa categoría

#### Scenario: Una sección vacía se muestra vacía
- **GIVEN** un vehículo sin averías pendientes
- **WHEN** se muestra el panel
- **THEN** la sección de pendientes aparece indicando que no hay ninguna, en lugar de ocultarse

#### Scenario: Sección no soportada
- **GIVEN** un vehículo que no soporta el Mode 0A
- **WHEN** se muestra el panel
- **THEN** la sección de permanentes indica que el vehículo no soporta esa consulta, distinguiéndola de una lista vacía

---

### Requirement: Soporte de los nuevos modos en los emuladores
El sistema SHALL responder a los modos `01 01`, `04`, `07` y `0A` en los tres escenarios de `docker/elm327/scenarios/`.

#### Scenario: Audi con averías
- **GIVEN** el escenario `audi_a3_tdi`
- **WHEN** se consultan los nuevos modos
- **THEN** responde con el testigo encendido, el número de averías almacenadas coherente con su Mode 03, al menos una pendiente y al menos una permanente

#### Scenario: Vehículos sin averías
- **GIVEN** los escenarios de Kawasaki y Toyota
- **WHEN** se consultan los nuevos modos
- **THEN** responden con el testigo apagado y las tres listas vacías

#### Scenario: El emulador confirma el borrado sin cambiar de estado
- **GIVEN** el escenario del Audi
- **WHEN** se envía `04` y a continuación se vuelve a leer el Mode 03
- **THEN** el emulador responde confirmación positiva al `04`
- **AND** sigue devolviendo las mismas averías, por ser un emulador de tramas fijas
