# Elm327 TCP Repository

## Purpose

Adaptador OBD-II sobre TCP que implementa `ObdRepositoryPort` para comunicarse con el emulador ELM327 Docker. El transporte TCP usa una **conexión persistente** (un solo socket compartido para todas las peticiones, con cola de comandos serializada y auto-reconexión con backoff exponencial) en lugar de sockets efímeros por comando. Parseo de respuestas ELM327, aplicación de fórmulas SAE J1979 y VAG Mode 22, decodificación DTC SAE J2012, y extracción dinámica de VehicleInfo desde VIN.

## Requirements

### Requirement: Conexión TCP persistente al emulador ELM327
El sistema SHALL implementar `Elm327TcpRepository` en `infrastructure/elm327/elm327Adapter.ts` que se conecte vía TCP al emulador ELM327 usando un **único socket persistente** mantenido por `createElm327TcpClient` (`tcpTransport.ts`). Los comandos se serializan mediante una cola FIFO interna con mutex. En caso de rotura del socket, el cliente reconecta automáticamente con backoff exponencial.

#### Scenario: Envío de comando Mode 01 exitoso con socket persistente
- **GIVEN** el emulador ELM327 está disponible en `localhost:35000`
- **AND** el adapter se ha construido con `new Elm327TcpRepository({ host, port })`
- **AND** el cliente ha conectado el socket persistente vía `connect()` eager
- **WHEN** se invoca `readPid("01", "0C")`
- **THEN** se encola el comando `01 0C` en la cola FIFO del cliente
- **AND** se escribe `01 0C\r\n` al socket compartido
- **AND** se recibe `41 0C 0C 80`
- **AND** se extraen los bytes de datos `[0x0C, 0x80]`
- **AND** se aplica la fórmula `(A*256+B)/4`
- **AND** se devuelve el valor físico 800
- **AND** el socket permanece abierto para el siguiente comando

#### Scenario: Comandos serializados — el segundo comando espera al primero
- **GIVEN** un cliente TCP persistente conectado
- **WHEN** se invoca `sendCommand("01 0C")` y `sendCommand("01 05")` en rápida sucesión
- **THEN** el primer comando se escribe al socket inmediatamente
- **AND** el segundo comando se encola y NO se escribe hasta que el primero resuelve (recibe `>`)
- **AND** ambos comandos resuelven en orden con sus respuestas correctas

#### Scenario: Auto-reconexión tras cierre del socket
- **GIVEN** un cliente TCP persistente conectado y funcionando
- **WHEN** el socket emite el evento `close` (el emulador se cae)
- **THEN** el cliente inicia reconexión automática con backoff exponencial (100ms, 200ms, 400ms, ...)
- **AND** los comandos que lleguen durante la reconexión se encolan y esperan
- **WHEN** el emulador vuelve a estar disponible
- **THEN** el cliente reconecta exitosamente
- **AND** los comandos pendientes en cola se ejecutan en orden

#### Scenario: Auto-reconexión tras error de socket
- **GIVEN** un cliente TCP persistente conectado
- **WHEN** el socket emite un error `ECONNREFUSED` (el emulador rechaza la conexión)
- **THEN** el cliente inicia reconexión automática con backoff exponencial
- **AND** el comando actual se mantiene en cola para reintento tras reconexión

#### Scenario: Shutdown graceful con close()
- **GIVEN** un cliente TCP persistente conectado con comandos pendientes en cola
- **WHEN** se invoca `client.close()`
- **THEN** el socket se destruye inmediatamente
- **AND** todos los comandos pendientes en cola se rechazan con `Elm327ConnectionError("Connection closed")`
- **AND** la auto-reconexión NO se activa (estado `closed`)

#### Scenario: Timeout de comando individual
- **GIVEN** un cliente TCP persistente conectado
- **WHEN** se envía un comando y el emulador no responde en `timeout` ms (default 3000)
- **THEN** se rechaza el comando con `Elm327ConnectionError` indicando timeout
- **AND** el socket se considera corrupto y se destruye
- **AND** se inicia auto-reconexión para restaurar el socket
- **AND** los comandos siguientes en cola esperan la reconexión

#### Scenario: Conexión eager en el constructor del adapter
- **GIVEN** el emulador ELM327 está disponible
- **WHEN** se construye `new Elm327TcpRepository({ host: 'localhost', port: 35000 })`
- **THEN** el cliente TCP llama a `connect()` inmediatamente
- **AND** el socket queda abierto y listo para recibir comandos

---

### Requirement: Parseo de respuestas Mode 01 y Mode 02
El sistema SHALL parsear respuestas ELM327 en formato sin headers (AT H0): `4X YY [ZZ...]` donde `4X` = mode + 0x40, `YY` = PID, `ZZ` = data bytes.

#### Scenario: Parseo RPM (2 bytes de datos)
- **GIVEN** respuesta cruda `"01 0C\r41 0C 0C 80 \r\r>"`
- **WHEN** se parsea la respuesta
- **THEN** se extrae `[0x0C, 0x80]` ignorando echo y prompt

#### Scenario: Parseo Coolant (1 byte de datos)
- **GIVEN** respuesta `"01 05\r41 05 82 \r\r>"`
- **WHEN** se parsea la respuesta
- **THEN** se extrae `[0x82]`

#### Scenario: PID no soportado
- **GIVEN** respuesta `"NO DATA\r\n>"`
- **WHEN** se parsea la respuesta
- **THEN** se lanza `Elm327NoDataError`

---

### Requirement: Parseo de respuestas Mode 22 VAG UDS
El sistema SHALL parsear respuestas Mode 22 en formato: `62 XX XX [YY...]` donde `62` = SID + 0x40, `XX XX` = DID echo, `YY` = payload.

#### Scenario: Parseo VAG RPM (DID 1130)
- **GIVEN** respuesta `"62 11 30 0C 80"`
- **WHEN** se parsea la respuesta
- **THEN** se extrae `[0x0C, 0x80]` (saltando SID + DID = 3 bytes)

#### Scenario: Parseo VAG Coolant (DID F430)
- **GIVEN** respuesta `"62 F4 30 5A"`
- **WHEN** se parsea la respuesta
- **THEN** se extrae `[0x5A]`

---

### Requirement: Parseo de VIN multi-línea (Mode 09 PID 02)
El sistema SHALL parsear respuestas VIN multi-línea del ELM327 con formato `N: 49 02 01 [ASCII hex...]`.

#### Scenario: VIN Porsche
- **GIVEN** respuesta multi-línea con VIN `WP0ZZZ99ZTS390000`
- **WHEN** se invoca `readVin()`
- **THEN** se devuelve el string `"WP0ZZZ99ZTS390000"`

#### Scenario: VIN Audi
- **GIVEN** respuesta multi-línea con VIN `WAUZZZ8V5JA123456`
- **WHEN** se invoca `readVin()`
- **THEN** se devuelve el string `"WAUZZZ8V5JA123456"`

---

### Requirement: Parseo y decodificación de DTCs (Mode 03)
El sistema SHALL parsear respuestas Mode 03 (`43 XX XX [XX XX...]`) y decodificar cada par de bytes a código DTC según SAE J2012.

#### Scenario: Múltiples DTCs
- **GIVEN** respuesta `"43 03 01 04 01"`
- **WHEN** se invoca `readDtcCodes()`
- **THEN** se devuelve `[{code:"P0301",description:""}, {code:"P0401",description:""}]`

#### Scenario: Sin DTCs (NO DATA)
- **GIVEN** respuesta `"NO DATA"`
- **WHEN** se invoca `readDtcCodes()`
- **THEN** se devuelve `[]`

---

### Requirement: Extracción de VehicleInfo desde VIN
El sistema SHALL extraer `VehicleInfo` del VIN leído dinámicamente del emulador, usando `manufacturer()` (WMI registry) y `modelYear()` (posición 10 ISO 3779) del domain `Vin`.

#### Scenario: VIN Audi (WAU)
- **GIVEN** VIN `WAUZZZ8V5JA123456`
- **WHEN** se invoca `getVehicleInfo()`
- **THEN** devuelve `{ make: "Audi", model: "unknown", year: 2018, engineType: "unknown", vin: Vin }`

#### Scenario: VIN Kawasaki (JKA)
- **GIVEN** VIN `JKAZR2A1XLA000111`
- **WHEN** se invoca `getVehicleInfo()`
- **THEN** devuelve `{ make: "Kawasaki", model: "unknown", year: 2020, engineType: "unknown", vin: Vin }`

#### Scenario: WMI desconocido
- **GIVEN** VIN con WMI no registrado (ej. `XTA...`)
- **WHEN** se invoca `getVehicleInfo()`
- **THEN** devuelve `{ make: "unknown", model: "unknown", year: <año>, engineType: "unknown", vin: Vin }`

---

### Requirement: Inyección dual-mode en server
El sistema SHALL soportar dos modos de operación controlados por `OBD_MODE`: `sync` (simulador in-process con escenarios) y `tcp` (Elm327TcpRepository contra el emulador Docker).

#### Scenario: Modo TCP no requiere scenarioId
- **GIVEN** el servidor está en modo `OBD_MODE=tcp`
- **WHEN** se hace `POST /api/diagnosis` (sin body o con body vacío)
- **THEN** se ejecuta el diagnóstico contra el emulador ELM327 vía `Elm327TcpRepository`
- **AND** no se requiere `scenarioId` en el body

#### Scenario: Modo TCP expone un escenario sintético
- **GIVEN** el servidor está en modo `OBD_MODE=tcp`
- **WHEN** se hace `GET /api/scenarios`
- **THEN** devuelve un array con un escenario `{ id: "tcp", name: "ELM327 Direct Connection", vehicleType: "car" }`
