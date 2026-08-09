# Diagnosis SQLite Persistence

## Purpose

Cableado de las escrituras SQLite (`vehicles`, `diagnosis_sessions`, `pid_readings`, `ecus`, `pid_definitions`, `dtc_definitions`) durante el flujo de diagnóstico cognitivo. El schema y el repositorio ya existen en su mayor parte; este cambio conecta los puntos de escritura para que cada diagnóstico deje trazabilidad en la base de datos relacional, con scope de manufacturer/model para definiciones compartidas, deduplicación de ECUs y DTCs, y degradación elegante si el repositorio no está configurado o falla.

## Requirements

### Requirement: Persistencia del vehículo al iniciar el diagnóstico cognitivo

El sistema SHALL persistir el vehículo en la tabla `vehicles` al iniciar `cognitiveDiagnosis()`, antes de crear el servidor MCP, usando los datos de identificación obtenidos del repositorio OBD.

#### Scenario: Vehículo nuevo — primera diagnosis
- **GIVEN** un `VehicleRepository` configurado y un vehículo con VIN `WUZZZ8V5FA123456`
- **WHEN** se inicia `cognitiveDiagnosis()`
- **THEN** existe una fila en `vehicles` con `vin = 'WUZZZ8V5FA123456'`, `make`, `model`, `year` y `engineType` del vehículo conectado
- **AND** `firstSeen` y `lastSeen` reflejan la fecha de creación

#### Scenario: Vehículo ya conocido — re-diagnosis
- **GIVEN** un vehículo con VIN `WUZZZ8V5FA123456` ya existe en `vehicles`
- **WHEN** se inicia un nuevo `cognitiveDiagnosis()` para el mismo vehículo
- **THEN** la fila existente se actualiza con `lastSeen` al momento actual
- **AND** no se crea una segunda fila para el mismo VIN

#### Scenario: VehicleRepository no configurado
- **GIVEN** `vehicleRepo` es `undefined` en `DiagnosisServiceOptions`
- **WHEN** se inicia `cognitiveDiagnosis()`
- **THEN** no se intenta ninguna escritura en `vehicles`
- **AND** el diagnóstico cognitivo se ejecuta con normalidad

#### Scenario: Fallo al escribir en vehicles
- **GIVEN** `vehicleRepo.upsertVehicle()` lanza un error (ej. SQLite bloqueado)
- **WHEN** se inicia `cognitiveDiagnosis()`
- **THEN** el error se registra en el log
- **AND** el diagnóstico cognitivo continúa sin `vehicleId` ni `sessionId`
- **AND** no se propaga la excepción al llamante

---

### Requirement: Creación y cierre de sesión de diagnóstico

El sistema SHALL crear una fila en `diagnosis_sessions` al iniciar `cognitiveDiagnosis()` y poblarla con `endedAt` al terminar, independientemente de si el diagnóstico completó con éxito, agotó el timeout o lanzó un error.

#### Scenario: Diagnóstico completado con éxito
- **GIVEN** un `vehicleId` válido obtenido del upsert del vehículo
- **WHEN** `cognitiveDiagnosis()` completa exitosamente
- **THEN** existe una fila en `diagnosis_sessions` con `vehicleId`, `scenarioId` (si aplica), `startedAt` y `endedAt` poblados

#### Scenario: Timeout del diagnóstico
- **GIVEN** un diagnóstico que excede `cognitiveTimeoutMs`
- **WHEN** se lanza `CognitiveDiagnosisTimeoutError`
- **THEN** la sesión se cierra igual con `endedAt` poblado
- **AND** el error de timeout se propaga al llamante

#### Scenario: Sin vehículo persistido
- **GIVEN** `vehicleRepo` está configurado pero `upsertVehicle` falló
- **WHEN** se inicia `cognitiveDiagnosis()`
- **THEN** no se crea sesión (no hay `vehicleId` válido)
- **AND** el diagnóstico se ejecuta sin `sessionContext`

---

### Requirement: Persistencia de lecturas de PID en la sesión activa

El sistema SHALL guardar cada lectura de PID en `pid_readings` cuando el LLM invoca la tool `read_pid` durante una sesión de diagnóstico, asociándola al `sessionId` de la sesión activa.

#### Scenario: Lectura de PID con sesión activa
- **GIVEN** una sesión de diagnóstico activa con `sessionId = 42`
- **WHEN** el LLM llama a `read_pid` con `mode = '01'` y `pid = '0C'` y el ELM327 responde `0C 41 0C 1A F8`
- **THEN** se inserta una fila en `pid_readings` con `session_id = '42'`, `raw_hex = '41 0C 1A F8'` y `parsed_value` con el valor decodificado
- **AND** la tool devuelve el valor al LLM sin esperar a que la escritura SQLite confirme

#### Scenario: Lectura de PID sin sesión activa
- **GIVEN** `sessionContext` es `undefined` (vehicleRepo no configurado o falló el upsert)
- **WHEN** el LLM llama a `read_pid`
- **THEN** la tool devuelve el valor normalmente
- **AND** no se intenta ninguna escritura en `pid_readings`

#### Scenario: Fallo al escribir la lectura
- **GIVEN** `vehicleRepo.insertPidReading()` lanza un error
- **WHEN** el LLM llama a `read_pid`
- **THEN** el error se captura silenciosamente (`.catch()`)
- **AND** la tool devuelve el valor del PID normalmente

#### Scenario: Modo 01 no persiste definición, pero sí la lectura
- **GIVEN** una sesión activa
- **WHEN** el LLM llama a `read_pid` con `mode = '01'`
- **THEN** no se llama a `autoRegisterPid` (comportamiento existente: solo mode ≠ '01')
- **AND** la lectura se guarda en `pid_readings` independientemente

---

### Requirement: Persistencia de ECUs descubiertas con deduplicación

El sistema SHALL guardar las ECUs descubiertas en la tabla `ecus` cuando el LLM invoca la tool `get_ecu_info`, asociándolas al `vehicleId` de la sesión activa, sin duplicar ECUs ya registradas para el mismo vehículo.

#### Scenario: ECUs descubiertas con sesión activa
- **GIVEN** una sesión activa con `vehicleId = 7`
- **WHEN** el LLM llama a `get_ecu_info` y el repositorio OBD devuelve `[{ name: 'Engine', requestAddr: '7E0', responseAddr: '7E8', type: 'ECM', protocol: 'CAN_11_500' }]`
- **THEN** se inserta una fila en `ecus` con `vehicle_id = 7` y los datos de la ECU
- **AND** `discovered_at` refleja el momento de la inserción
- **AND** la tool devuelve la lista de ECUs al LLM sin esperar a las escrituras

#### Scenario: ECU ya registrada para el mismo vehículo — no se duplica
- **GIVEN** el vehículo 7 ya tiene una ECU con `request_addr = '7E0'` y `response_addr = '7E8'`
- **WHEN** el LLM llama a `get_ecu_info` y el repositorio OBD devuelve la misma ECU
- **THEN** no se inserta una segunda fila en `ecus`
- **AND** la fila existente actualiza su `discovered_at` a la fecha actual

#### Scenario: Sin ECUs descubiertas
- **GIVEN** el repositorio OBD devuelve `[]`
- **WHEN** el LLM llama a `get_ecu_info`
- **THEN** la tool responde "No ECUs discovered."
- **AND** no se intenta ninguna escritura en `ecus`

#### Scenario: Sin sesión activa
- **GIVEN** `sessionContext` es `undefined`
- **WHEN** el LLM llama a `get_ecu_info`
- **THEN** la tool devuelve los datos de ECU normalmente
- **AND** no se intenta ninguna escritura en `ecus`

#### Scenario: Fallo al escribir ECU
- **GIVEN** `vehicleRepo.insertEcu()` lanza un error
- **WHEN** el LLM llama a `get_ecu_info`
- **THEN** el error se captura silenciosamente
- **AND** la tool devuelve la lista de ECUs normalmente

#### Scenario: Fallo en la consulta de dedup
- **GIVEN** `vehicleRepo.findEcuByAddress()` lanza un error
- **WHEN** el LLM llama a `get_ecu_info`
- **THEN** esa ECU se salta (no se inserta ni se actualiza)
- **AND** las demás ECUs se procesan normalmente
- **AND** la tool devuelve la lista de ECUs al LLM

---

### Requirement: SessionContext como contrato del servidor MCP

El sistema SHALL aceptar un parámetro opcional `sessionContext` con `{ sessionId, vehicleId, manufacturer, model }` en `createMcpServer` y propagarlo exclusivamente a los handlers que realizan escrituras en SQLite o necesitan scope de definiciones.

#### Scenario: sessionContext presente
- **GIVEN** `sessionContext = { sessionId: 42, vehicleId: 7, manufacturer: 'Audi', model: 'A3' }`
- **WHEN** se crea el servidor MCP
- **THEN** `handleReadPid` recibe `sessionContext` y persiste lecturas con scope manufacturer/model
- **AND** `handleGetEcuInfo` recibe `sessionContext` y persiste ECUs con dedup
- **AND** `handleGetDtcCodes` recibe `sessionContext` y persiste DTC definitions con scope manufacturer/model
- **AND** el resto de handlers (`handleGetFreezeFrame`, `handleReadVin`, `handleGetVehicleInfo`, `handleGetAvailablePids`) no acceden a `sessionContext`

#### Scenario: sessionContext ausente
- **GIVEN** `sessionContext` es `undefined`
- **WHEN** se crea el servidor MCP y se invoca cualquier tool
- **THEN** todas las tools funcionan con normalidad, sin intentar escrituras SQLite

#### Scenario: manufacturer normalizado en sessionContext
- **GIVEN** el OBD devuelve `make = 'AUDI'`
- **WHEN** `cognitiveDiagnosis()` construye `sessionContext`
- **THEN** `sessionContext.manufacturer` es `'Audi'` (normalizado vía `normalizeManufacturer`)
- **AND** `sessionContext.model` se conserva tal cual del OBD (ya suele estar en title-case)

---

### Requirement: Persistencia de DTC definitions con scope manufacturer/model

El sistema SHALL persistir los DTC codes descubiertos en la nueva tabla `dtc_definitions` cuando el LLM invoca la tool `get_dtc_codes`, con scope de unicidad `(manufacturer, model, code)` para evitar duplicados entre vehículos del mismo fabricante y modelo.

#### Scenario: DTC nuevo para un fabricante/modelo
- **GIVEN** una sesión activa con `manufacturer = 'Audi'` y `model = 'A3'`
- **WHEN** el LLM llama a `get_dtc_codes` y el OBD devuelve `[{ code: 'P0301', description: 'Cylinder 1 Misfire Detected' }]`
- **THEN** se inserta una fila en `dtc_definitions` con `manufacturer = 'Audi'`, `model = 'A3'`, `code = 'P0301'`, `description = 'Cylinder 1 Misfire Detected'`
- **AND** `first_seen` y `last_seen` reflejan el momento actual
- **AND** la tool devuelve la lista de DTCs al LLM sin esperar a la escritura

#### Scenario: DTC ya conocido para el mismo fabricante/modelo — no se duplica
- **GIVEN** ya existe `('Audi', 'A3', 'P0301')` en `dtc_definitions`
- **WHEN** otro Audi A3 (distinto VIN) descubre el mismo DTC `P0301`
- **THEN** no se crea una segunda fila — la constraint `UNIQUE(manufacturer, model, code)` lo impide
- **AND** la fila existente actualiza `last_seen` a la fecha actual
- **AND** si la nueva descripción difiere de la existente, se actualiza `description` (el dato más reciente prevalece)

#### Scenario: Mismo DTC, distinto fabricante — se trata como distinto
- **GIVEN** existe `('Audi', 'A3', 'P0301')` en `dtc_definitions`
- **WHEN** un Toyota Corolla descubre `P0301`
- **THEN** se inserta una nueva fila con `manufacturer = 'Toyota'`, `model = 'Corolla'`, `code = 'P0301'`
- **AND** ambas filas coexisten (mismo código, distinto scope)

#### Scenario: Sin sesión activa
- **GIVEN** `sessionContext` es `undefined`
- **WHEN** el LLM llama a `get_dtc_codes`
- **THEN** la tool devuelve los DTCs normalmente
- **AND** no se intenta ninguna escritura en `dtc_definitions`

#### Scenario: Fallo al escribir DTC definition
- **GIVEN** `vehicleRepo.upsertDtcDefinition()` lanza un error (ej. violación de unicidad por race condition)
- **WHEN** el LLM llama a `get_dtc_codes`
- **THEN** el error se captura silenciosamente
- **AND** la tool devuelve la lista de DTCs normalmente

---

### Requirement: Deduplicación de PID definitions por manufacturer/model

El sistema SHALL evitar la inserción de definiciones de PID duplicadas para el mismo fabricante y modelo, reutilizando definiciones existentes cuando un PID ya fue registrado por otro vehículo del mismo `manufacturer` + `model`.

#### Scenario: PID ya registrado para el mismo manufacturer/model — se reutiliza
- **GIVEN** un Audi A3 (VIN A) ya registró el PID `mode='22', pidCode='F40D'` en `pid_definitions` con `vehicle_id` apuntando al VIN A
- **WHEN** otro Audi A3 (VIN B) lee el mismo PID `22 F40D` y `autoRegisterPid` intenta registrarlo
- **THEN** la query de dedup encuentra la definición existente (JOIN con `vehicles` filtrando por `make='Audi'` AND `model='A3'`)
- **AND** no se inserta una segunda definición
- **AND** se devuelve la definición existente para usarla en `pid_readings.pid_def_id`

#### Scenario: PID nuevo para el manufacturer/model — se inserta
- **GIVEN** ningún Audi A3 ha registrado el PID `mode='22', pidCode='F40D'`
- **WHEN** un Audi A3 lee ese PID por primera vez
- **THEN** se inserta una nueva fila en `pid_definitions` con el `vehicle_id` del vehículo actual
- **AND** los demás campos (`name`, `formula`, `unit`, etc.) se persisten con los valores descubiertos

#### Scenario: Mismo PID, distinto fabricante — se trata como distinto
- **GIVEN** existe un PID `22 F40D` para `('Audi', 'A3')`
- **WHEN** un Toyota Corolla registra el mismo PID `22 F40D`
- **THEN** se inserta una nueva definición (distinto scope manufacturer/model)
- **AND** ambas definiciones coexisten

#### Scenario: Sin manufacturer/model en sessionContext — fallback a vehicleId
- **GIVEN** `sessionContext.manufacturer` o `sessionContext.model` están vacíos
- **WHEN** se intenta registrar un PID
- **THEN** se usa el `vehicleId` como scope de dedup (comportamiento previo, sin JOIN)
- **AND** se inserta la definición si no existe para ese `vehicleId` concreto

#### Scenario: Fallo en la query de dedup
- **GIVEN** la query JOIN para buscar definiciones por manufacturer/model lanza error
- **WHEN** se intenta registrar un PID
- **THEN** el error se captura silenciosamente
- **AND** se procede a insertar la definición normalmente (sin dedup — peor caso: duplicado aceptable)

---

### Requirement: Normalización de manufacturer para scope de definiciones

El sistema SHALL normalizar el campo `manufacturer` antes de usarlo como clave de scope en definiciones de PID y DTC, aplicando title-case y un mapa de abreviaturas conocidas para garantizar que variantes como `"AUDI"`, `"audi"` y `"Audi"` produzcan la misma clave de agrupación.

#### Scenario: Fabricante en mayúsculas se normaliza a title-case
- **GIVEN** el OBD devuelve `make = 'AUDI'`
- **WHEN** `normalizeManufacturer('AUDI')` es invocada
- **THEN** devuelve `'Audi'`

#### Scenario: Abreviatura conocida se expande
- **GIVEN** el OBD devuelve `make = 'VW'`
- **WHEN** `normalizeManufacturer('VW')` es invocada
- **THEN** devuelve `'Volkswagen'`

#### Scenario: Fabricante con sufijo corporativo se limpia
- **GIVEN** el OBD devuelve `make = 'AUDI AG'`
- **WHEN** `normalizeManufacturer('AUDI AG')` es invocada
- **THEN** devuelve `'Audi'` (sufijo `AG` eliminado, title-case aplicado)

#### Scenario: Fabricante desconocido se preserva en title-case
- **GIVEN** el OBD devuelve `make = 'ssangyong'`
- **WHEN** `normalizeManufacturer('ssangyong')` es invocada
- **THEN** devuelve `'Ssangyong'` (sin entrada en el mapa de abreviaturas, solo title-case)

#### Scenario: Cadena vacía devuelve fallback
- **GIVEN** el OBD devuelve `make = ''`
- **WHEN** `normalizeManufacturer('')` es invocada
- **THEN** devuelve `'Unknown'`
