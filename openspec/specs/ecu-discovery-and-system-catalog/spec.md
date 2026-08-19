# ECU Discovery and System Catalog

## Purpose

El sistema descubre físicamente las unidades de control electrónico (ECUs) presentes en el bus CAN del vehículo conectado mediante auto-scan por functional addressing, y organiza el catálogo de PIDs por sistema/ECU a nivel fabricante/modelo. Además mantiene un catálogo auto-expansivo de ECUs (vacío al inicio) que aprende direcciones → nombre/tipo/sistema con el uso. Sustituye el comportamiento previo en el que `getEcuInfo()` en modo TCP devolvía `[]` (o una ECU sintética) y en el que `pid_definitions` estaba atado a un vehículo concreto (`vehicle_id`/`ecu_id`) en vez de a fabricante/modelo. Las lecturas de PID pasan a ser autodescriptivas (`mode` + `pid_code`) y ligadas a sesión por FK.

## Requirements

### Requirement: Descubrimiento de ECUs por functional addressing CAN
El sistema SHALL consultar al adaptador qué protocolo negoció con el vehículo **antes** de
emitir ningún comando de configuración, y SHALL derivar de él la dirección de broadcast
funcional. El sistema NO SHALL imponer un protocolo de bus: la negociación es del init y el
barrido solo la lee.

El barrido SHALL cubrir los cuatro protocolos CAN de ISO 15765-4 —11 y 29 bits, a 500 y
250 kbps— mapeando cada dirección de respuesta a una `EcuInfo` con `responseAddr`,
`requestAddr` derivado según el ancho de dirección, `type`/`name` resueltos desde el
catálogo (que solo estandariza el ECM; el resto SHALL resolverse como `UNKNOWN`) y
`protocol` reflejando el bus realmente negociado.

#### Scenario: El barrido lee el protocolo antes de configurar nada
- **GIVEN** un `Elm327Transport` conectado a un vehículo que negoció CAN 11 bits / 500 kbps
- **WHEN** se invoca `getEcuInfo()`
- **THEN** el primer comando emitido es la consulta del protocolo negociado
- **AND** no se emite ningún comando que fije el protocolo del bus

#### Scenario: Broadcast multi-ECU en CAN de 11 bits
- **GIVEN** un vehículo en CAN 11 bits que, tras headers ON y broadcast funcional, responde a `01 00` con `7E8 06 41 00 BE 3F A8 13` y `7E9 06 41 00 ...`
- **WHEN** se invoca `getEcuInfo()`
- **THEN** devuelve 2 `EcuInfo`: la `7E8` con `type = 'ECM'` (7E0→7E8) y la `7E9` con `type = 'UNKNOWN'` (7E1→7E9)
- **AND** `requestAddr` se deriva aritméticamente (`respuesta − 8`)

#### Scenario: Broadcast multi-ECU en CAN de 29 bits
- **GIVEN** un vehículo que negoció CAN 29 bits y responde desde `18DAF110` y `18DAF111`
- **WHEN** se invoca `getEcuInfo()`
- **THEN** el broadcast se dirige a la dirección funcional de 29 bits, no a la de 11
- **AND** devuelve 2 `EcuInfo`: `18DAF110` como ECM con petición `18DA10F1`, y `18DAF111` como `UNKNOWN` con petición `18DA11F1`

#### Scenario: El protocolo del bus se refleja en la ECU descubierta
- **GIVEN** un vehículo que negoció CAN 11 bits a 250 kbps
- **WHEN** se descubre una ECU
- **THEN** su `protocol` corresponde a ese bus, no a una constante fija

#### Scenario: En un bus pre-CAN el barrido se abstiene sin tocar el adaptador
- **GIVEN** un vehículo que negoció un protocolo anterior a CAN (ISO 9141-2, KWP2000 o J1850)
- **WHEN** se invoca `getEcuInfo()`
- **THEN** devuelve `[]`
- **AND** el único comando emitido es la consulta del protocolo — no se altera ni el header, ni el eco, ni el protocolo del adaptador
- **AND** las lecturas posteriores de PID, DTC y VIN siguen funcionando igual que antes del barrido

#### Scenario: Un protocolo irreconocible se trata como no soportado
- **GIVEN** un adaptador que responde a la consulta de protocolo con algo que no identifica ningún bus conocido
- **WHEN** se invoca `getEcuInfo()`
- **THEN** devuelve `[]` sin emitir ningún comando de configuración
- **AND** no se supone un protocolo por defecto

#### Scenario: Headers duplicados se deduplican
- **GIVEN** una respuesta broadcast con `7E8` repetido (dos tramas del mismo módulo)
- **WHEN** se parsea la respuesta
- **THEN** se devuelve una única `EcuInfo` para `7E8`

#### Scenario: Headers fuera del direccionamiento OBD se ignoran
- **GIVEN** una respuesta en CAN 11 bits con headers `7E8`, `7EF` y `7B8` (ABS, fuera del rango legislado)
- **WHEN** se parsea la respuesta
- **THEN** solo se devuelven ECUs para los headers en rango `7E8–7EF`
- **AND** en CAN 29 bits, se descarta toda trama que no vaya dirigida al equipo de diagnóstico

#### Scenario: Dirección desconocida usa derivación aritmética
- **GIVEN** un header `7EC` sin entrada en el catálogo ISO 15765-4
- **WHEN** se resuelve la ECU
- **THEN** devuelve `type = 'UNKNOWN'`, `name = 'ECU 7EC'`, `requestAddr = '7E4'` (7EC − 8)

#### Scenario: Emulador y coche real usan el mismo mecanismo
- **GIVEN** un bus (emulador Docker o coche real) cuyo único módulo responde con header `7E8`
- **WHEN** se invoca `getEcuInfo()`
- **THEN** devuelve una única `EcuInfo` ECM (`7E0/7E8`)
- **AND** no existe rama de "simulación" con datos fake — el resultado es idéntico para emulador y coche real con un solo módulo

---

### Requirement: Fallback Mode 09 PID 0A cuando el broadcast no responde
El sistema SHALL caer a Mode 09 PID 0A (ECU name) con addressing físico al ECU de motor
cuando el broadcast por functional addressing no produzca ninguna respuesta, devolviendo
una única `EcuInfo` ECM. La dirección física SHALL corresponder al protocolo negociado
—`7E0`/`7E8` en 11 bits, `18DA10F1`/`18DAF110` en 29 bits—. Si tampoco responde, SHALL
devolver `[]`.

#### Scenario: Broadcast vacío y 09 0A responde
- **GIVEN** un transporte que a `01 00` (functional) devuelve vacío, y al dirigirse físicamente al ECM responde `49 0A 01 ...` a `09 0A`
- **WHEN** se invoca `getEcuInfo()`
- **THEN** devuelve una `EcuInfo` ECM con el par de direcciones propio del protocolo negociado

#### Scenario: Broadcast vacío y 09 0A no responde
- **GIVEN** un transporte que devuelve vacío a `01 00` y `NO DATA` a `09 0A`
- **WHEN** se invoca `getEcuInfo()`
- **THEN** devuelve `[]` (no lanza error)

## ADDED Requirements

---

### Requirement: Catálogo de direcciones CAN ISO 15765-4 en dominio (solo estándar, sin inventar nombres)
El sistema SHALL resolver dirección CAN → nombre/tipo de ECU mediante un catálogo en dominio (constante pura, sin imports de capas superiores) que contiene **únicamente** la dirección estandarizada ISO 15765-4 `7E0/7E8 = ECM (Engine Control Module)`. Toda otra dirección física SHALL resolverse a `type = 'UNKNOWN'` con `name = 'ECU <response_addr>'` y `requestAddr` derivado aritméticamente (`response − 8`). El sistema SHALL NOT inventar nombres o tipos (TCM/ABS/BCM/SRS/IPC…) para direcciones no estandarizadas.

#### Scenario: Dirección estandarizada se resuelve a ECM
- **GIVEN** el catálogo de dominio
- **WHEN** se resuelve `7E8`
- **THEN** devuelve `type = 'ECM'`, `name = 'Engine Control Module'`, `requestAddr = '7E0'`

#### Scenario: Dirección no estandarizada se devuelve como UNKNOWN
- **GIVEN** los headers `7E9`, `7EA`, `7EB`, `7EC`, `7ED`
- **WHEN** se resuelven
- **THEN** cada una devuelve `type = 'UNKNOWN'` y `name = 'ECU <response_addr>'`
- **AND** no se asignan nombres tipo TCM/ABS/BCM/SRS/IPC
- **AND** `requestAddr = response − 8`

---

### Requirement: Catálogo auto-expansivo de ECUs (opción B) — vacío + aprendizaje
El sistema SHALL mantener un catálogo de definiciones de ECU (`ecu_definitions` SQLite + `ecus_index` LanceDB) que **nace vacío** y se llena por aprendizaje. No SHALL seedearse ningún mapa vehículo-específico; solo la dirección estandarizada `7E0/7E8 = ECM` vive en código (`ecuAddressCatalog.ts`). Cada definición SHALL identificar unívocamente la tupla `(manufacturer, model, response_addr)` y guardar `name`, `type`, `system`, `confidence` y `source`.

#### Scenario: Catálogo vacío al inicio
- **GIVEN** una base de datos recién migrada
- **WHEN** se consulta `ecu_definitions`
- **THEN** no hay filas (vacío)

#### Scenario: Aprendizaje inserta una definición
- **GIVEN** el mecánico confirma que `7E9` es la transmisión de un Audi A3
- **WHEN** se invoca `index_ecu` con `{ manufacturer: 'Audi', model: 'A3', responseAddr: '7E9', requestAddr: '7E1', name: 'Transmission Control Module', type: 'TCM', system: 'Transmission', confidence: 0.8, source: 'mechanic' }`
- **THEN** se inserta una fila en `ecu_definitions` con `confidence = 0.8`, `source = 'mechanic'`
- **AND** se indexa en `ecus_index` para búsqueda semántica

#### Scenario: Unique por (manufacturer, model, response_addr)
- **GIVEN** dos definiciones para `(Audi, A3, 7E9)` con `source` distinto
- **WHEN** se insertan
- **THEN** la segunda actualiza la primera (upsert), no se duplica

---

### Requirement: Resolución de ECUs UNKNOWN contra el catálogo
El sistema SHALL resolver las ECUs `UNKNOWN` descubiertas en el auto-scan buscando en `ecu_definitions` por `(manufacturer, model, response_addr)`. Si existe definición con `confidence ≥ 0.7`, SHALL resolver `name`/`type` reales; si no hay match o `confidence < 0.7`, SHALL mantener `UNKNOWN`. La resolución SHALL ocurrir en `handleGetEcuInfo` (con `manufacturer`/`model` del `sessionContext`), no en el adapter (context-free).

#### Scenario: UNKNOWN resuelto desde el catálogo
- **GIVEN** un scan que devuelve `7E9` como `UNKNOWN`, y `ecu_definitions` tiene `(Audi, A3, 7E9)` con `confidence = 0.8`
- **WHEN** se invoca `handleGetEcuInfo` con `manufacturer = 'Audi'`, `model = 'A3'`
- **THEN** la `EcuInfo` de `7E9` se devuelve con `name = 'Transmission Control Module'`, `type = 'TCM'`

#### Scenario: UNKNOWN sin match se mantiene
- **GIVEN** un scan que devuelve `7EB` como `UNKNOWN`, y `ecu_definitions` no tiene entrada para `(Audi, A3, 7EB)`
- **WHEN** se invoca `handleGetEcuInfo`
- **THEN** la `EcuInfo` de `7EB` se mantiene `UNKNOWN` (`name = 'ECU 7EB'`)

#### Scenario: Confianza baja no resuelve
- **GIVEN** `ecu_definitions` tiene `(Audi, A3, 7E9)` con `confidence = 0.3` (web, sin validar)
- **WHEN** se invoca `handleGetEcuInfo`
- **THEN** la `EcuInfo` de `7E9` se mantiene `UNKNOWN` (no se resuelve con confianza baja)

---

### Requirement: Tools MCP de aprendizaje de ECUs
El sistema SHALL exponer las tools MCP `search_similar_ecus` (búsqueda semántica en `ecus_index`) e `index_ecu` (INSERT/upsert en `ecu_definitions` + `ecus_index`), espejo de `search_similar_dtcs`/`index_dtc`.

#### Scenario: index_ecu escribe en la BD relacional
- **GIVEN** una sesión con el stack vectorial inicializado
- **WHEN** el LLM invoca `index_ecu` con una definición aprendida
- **THEN** la definición queda persistida en `ecu_definitions` (SQLite) y consultable por `search_similar_ecus`

---

### Requirement: Nivel "sistema/ECU" en el catálogo de PIDs
El sistema SHALL añadir un campo `system` (texto, opcional) a `pid_definitions` para agrupar PIDs por sistema/ECU a nivel fabricante/modelo. El unique index `(mode, pid_code, manufacturer, model)` SHALL permanecer inalterado (el sistema no forma parte de la identidad del PID). Los PIDs seedeados SHALL llevar `system` poblado con un vocabulario controlado.

#### Scenario: PID con sistema asignado
- **GIVEN** el PID Mode 22 `0300` "TCU Odometer" de Toyota Auris Hybrid
- **WHEN** se seedea el catálogo
- **THEN** la fila en `pid_definitions` tiene `system = 'Transmission'`

#### Scenario: Agrupación por sistema preserva unicidad
- **GIVEN** el unique index `(mode, pid_code, manufacturer, model)`
- **WHEN** se inserta el mismo PID `(22, 0300, Toyota, Auris Hybrid)` dos veces con `system` distinto
- **THEN** la segunda inserción es rechazada por el unique index (el sistema no altera la identidad)

#### Scenario: PID universal Mode 01 lleva sistema por defecto
- **GIVEN** el PID Mode 01 `0C` "Engine RPM" en `seed-pids.ts`
- **WHEN** se construye la definición
- **THEN** `system = 'Engine'` (y `0D` Vehicle Speed → `system = 'Vehicle'`)

---

### Requirement: `pid_definitions` sin `vehicle_id` ni `ecu_id`
El sistema SHALL eliminar las columnas `vehicle_id` y `ecu_id` de `pid_definitions`. Los PIDs SHALL estar escopados exclusivamente por `manufacturer`/`model` (nivel fabricante/modelo), no por vehículo. La relación coche↔PID SHALL ser derivada por `vehicle.make`/`model` = `pid_definitions.manufacturer`/`model`.

#### Scenario: Definición de PID sin vínculo a vehículo
- **GIVEN** un PID Mode 22 `F40D` de Audi A3
- **WHEN** se inserta en `pid_definitions`
- **THEN** la fila no tiene `vehicle_id` ni `ecu_id`
- **AND** `manufacturer = 'Audi'`, `model = 'A3'`

#### Scenario: Dos vehículos del mismo modelo comparten definición
- **GIVEN** dos Audi A3 con VINs distintos
- **WHEN** ambos resuelven el PID `22 F40D`
- **THEN** se usa la misma definición (scope `Audi`/`A3`), no una por vehículo

#### Scenario: Lookup por fabricante/modelo sustituye al lookup por vehículo
- **GIVEN** `manufacturer = 'Audi'`, `model = 'A3'`
- **WHEN** se listan los PIDs del catálogo
- **THEN** se devuelven los PIDs de ese scope vía `findPidsByManufacturerModel` (ya no existe `findPidsByVehicle`)

---

### Requirement: `pid_readings` autodescriptivo y ligado a sesión
El sistema SHALL guardar cada lectura de PID con `mode` + `pid_code` (NOT NULL) para que sea interpretable sin JOIN a `pid_definitions`. `pid_def_id` SHALL permanecer como FK opcional (soft link). `session_id` SHALL ser FK entera a `diagnosis_sessions.id`.

#### Scenario: Lectura persistida con identidad autodescriptiva
- **GIVEN** una sesión activa con `sessionId = 42` y una lectura de `01 0C`
- **WHEN** `insertPidReading` guarda la lectura
- **THEN** la fila tiene `mode = '01'`, `pid_code = '0C'`, `session_id = 42`
- **AND** `pid_def_id` es null si no existe definición registrada (o el id si existe)

#### Scenario: Lectura sin definición registrada no queda huérfana
- **GIVEN** una lectura de un PID que no tiene fila en `pid_definitions`
- **WHEN** se persiste la lectura
- **THEN** la fila es recuperable por `mode`+`pid_code` (no depende de `pid_def_id`)

#### Scenario: session_id con integridad referencial
- **GIVEN** `session_id` es FK a `diagnosis_sessions.id`
- **WHEN** se intenta insertar una lectura con un `session_id` inexistente
- **THEN** la inserción viola la FK (y el flujo fire-and-forget la captura sin propagar)

---

### Requirement: Supersede del comportamiento TCP de `ecu-info-screen`
El sistema SHALL reemplazar el comportamiento documentado en `ecu-info-screen` según el cual `getEcuInfo()` en modo TCP devuelve "una única EcuInfo sintética fija de motor". Tras este cambio, en modo TCP devuelve las ECUs realmente descubiertas por el auto-scan.

#### Scenario: Modo TCP devuelve ECUs descubiertas, no sintéticas
- **GIVEN** un `Elm327TcpRepository` conectado a un bus con múltiples ECUs
- **WHEN** se invoca `getEcuInfo()`
- **THEN** devuelve las ECUs descubiertas (≥1, según el bus), no una sintética fija

#### Scenario: Sin bus conectado devuelve vacío
- **GIVEN** un `Elm327TcpRepository` cuyo broadcast y fallback 09 0A no obtienen respuesta
- **WHEN** se invoca `getEcuInfo()`
- **THEN** devuelve `[]`

#### Scenario: Simulador interno como fixture de test
- **GIVEN** un `ObdSimulatorRepository` sobre `seedScenarios`
- **WHEN** se invoca `getEcuInfo()`
- **THEN** devuelve `scenario.ecus` (fixture de test, no fuente del catálogo de ECUs del vehículo real)

---

### Requirement: El barrido deja el adaptador listo para las lecturas normales
El sistema SHALL restaurar, al terminar el barrido, la configuración que las lecturas
necesitan: cabeceras apagadas y las peticiones dirigidas al ECU de motor del protocolo
negociado. La dirección de broadcast SHALL quedar deshecha — sirve para preguntar quién hay
en el bus, no para leer parámetros, y dejarla puesta deja las lecturas sin respuesta. La
restauración SHALL ejecutarse también cuando el barrido falla, y el sistema NO SHALL dejar
el adaptador fijado a ningún protocolo.

#### Scenario: Las lecturas se comportan igual antes y después de un barrido
- **GIVEN** un vehículo del que se leen los PID de telemetría correctamente
- **WHEN** se ejecuta un barrido de ECUs y a continuación se repiten las mismas lecturas
- **THEN** devuelven valores equivalentes a los de antes del barrido

#### Scenario: El estado se restaura aunque el barrido falle
- **GIVEN** un bus que corta la comunicación en mitad del broadcast
- **WHEN** el barrido lanza el error correspondiente
- **THEN** el adaptador queda igualmente con las cabeceras apagadas y las peticiones dirigidas al ECU de motor

#### Scenario: Un fallo del barrido no deja el vehículo inaccesible
- **GIVEN** un barrido que ha fallado sobre un vehículo real
- **WHEN** se solicita a continuación la telemetría en vivo
- **THEN** responde con datos, sin necesidad de reiniciar la aplicación
