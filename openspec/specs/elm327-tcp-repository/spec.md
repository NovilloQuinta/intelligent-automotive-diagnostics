# Elm327 TCP Repository

## Purpose

Adaptador OBD-II sobre TCP que implementa `ObdRepositoryPort` para comunicarse con el emulador ELM327 Docker. El módulo `infrastructure/elm327/` se estructura en módulos SRP: errores (`errors.ts`), utilidades hex (`hexUtils.ts`), gramática del wire protocol (`protocol.ts`), catálogo de fórmulas SAE J1979 + VAG Mode 22 autocontenido (`pidFormulas.ts`), transporte TCP persistente (`tcpTransport.ts`) y el adapter como composition root (`elm327Adapter.ts`). El catálogo de fórmulas se construye desde `ALL_SEED_PIDS` vía `pidDefinitionsToFormulaEntries()` con imports desde `application/ports/` y `application/shared/`.

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

### Requirement: Descomposición SRP del adaptador ELM327
El sistema SHALL estructurar el módulo `infrastructure/elm327/` en módulos de responsabilidad única: `errors.ts` (errores `Elm327ConnectionError`, `Elm327NoDataError`, `Elm327ParseError`), `hexUtils.ts` (`parseHexBytes`, `bigEndian`), `protocol.ts` (gramática del wire protocol: `formatCommand`, `stripEcho`, `parseModeResponse`, `parseMode22Response`, `parseVinResponse`, `parseDtcResponse`, `parseSupportedPidBitmask`), `pidFormulas.ts` (catálogo de fórmulas + `createPidFormulaCatalog`), `tcpTransport.ts` (config TCP + `createElm327TcpClient`) y `elm327Adapter.ts` como composition root que implementa `Elm327TcpRepository implements ObdRepository` y re-exporta errores y config para compatibilidad de imports. Los 8 métodos públicos del puerto mantienen firma y comportamiento idénticos.

#### Scenario: Adapter como composition root
- **GIVEN** el módulo `elm327/` refactorizado
- **WHEN** se inspecciona `elm327Adapter.ts`
- **THEN** no contiene lógica de transporte TCP, parsing de respuestas ni tablas de fórmulas propias
- **AND** su constructor cablea `createElm327TcpClient(config)` y `createPidFormulaCatalog()`
- **AND** los 8 métodos públicos de `ObdRepository` conservan firma idéntica (readPid, getSupportedPids, getFreezeFrame, readDtcCodes, clearDtcCodes, readVin, getVehicleInfo, setPower)

#### Scenario: Re-exports de compatibilidad
- **GIVEN** el adapter refactorizado
- **WHEN** un consumidor importa `Elm327ConnectionError`, `Elm327NoDataError`, `Elm327ParseError` o `Elm327TcpConfig` desde `@/infrastructure/elm327/elm327Adapter.js`
- **THEN** los imports siguen resolviendo (re-exportados desde sus módulos propietarios)
- **AND** la definición vive únicamente en `errors.ts` y `tcpTransport.ts`

---

### Requirement: Catálogo de fórmulas autocontenido
El sistema SHALL mantener el catálogo de fórmulas del emulador ELM327 (`STANDARD_MODE_01_FORMULAS` con 16 fórmulas SAE Mode 01 y `VAG_MODE_22_FORMULAS` con 16 DIDs Mode 22) en `pidFormulas.ts` sin importar de `persistence/sqlite/seed-pids.ts`, y SHALL verificar por test que las fórmulas SAE coinciden con `STANDARD_MODE_01_PIDS` (paridad de `formula` + `dataBytes`).

#### Scenario: Módulo sin dependencia de persistencia
- **GIVEN** `src/infrastructure/elm327/pidFormulas.ts`
- **WHEN** se inspeccionan sus imports
- **THEN** no referencia `persistence/sqlite/seed-pids.ts`
- **AND** `apply(mode, pid, bytes)` devuelve el valor físico vía `evaluatePid` (fórmula conocida) o big-endian (fórmula desconocida/vacía)

#### Scenario: Paridad con el seed de persistencia
- **GIVEN** `STANDARD_MODE_01_PIDS` en `seed-pids.ts`
- **WHEN** se ejecuta el test de paridad de `pidFormulas.test.ts`
- **THEN** para las 16 entradas del catálogo SAE, `formula` y `dataBytes` coinciden con el seed
- **AND** el test falla si una fórmula o dataBytes diverge (anti-drift)

---

### Requirement: Inyección de catálogo de fórmulas desde nuevas ubicaciones
El sistema SHALL modificar `Elm327TcpRepository` en `infrastructure/elm327/elm327Adapter.ts` para importar `createPidFormulaCatalog` desde `./pidFormulaCatalog.js`, `PidFormulaCatalogPort` type desde `@/application/ports/PidFormulaCatalogPort.js`, y `pidDefinitionsToFormulaEntries` desde `@/application/shared/pidDefinitionsToFormulaEntries.js`. El catálogo se construye en el constructor con `createPidFormulaCatalog(pidDefinitionsToFormulaEntries(ALL_SEED_PIDS))` sin cambios de comportamiento.

#### Scenario: Import de createPidFormulaCatalog desde pidFormulaCatalog.ts
- **GIVEN** `elm327Adapter.ts` tras el refactor
- **WHEN** se inspeccionan sus imports
- **THEN** `createPidFormulaCatalog` se importa desde `./pidFormulaCatalog.js` (no desde `./pidFormulas.js`)
- **AND** `PidFormulaCatalogPort` type se importa desde `@/application/ports/PidFormulaCatalogPort.js`
- **AND** `pidDefinitionsToFormulaEntries` se importa desde `@/application/shared/pidDefinitionsToFormulaEntries.js`

#### Scenario: Constructor sin cambios de comportamiento
- **GIVEN** `Elm327TcpRepository` construido con `Elm327TcpConfig`
- **WHEN** se inspecciona el constructor
- **THEN** `this.pidFormulas = createPidFormulaCatalog(pidDefinitionsToFormulaEntries(ALL_SEED_PIDS))`
- **AND** el catálogo resultante tiene el mismo comportamiento que antes del refactor

#### Scenario: readPid Mode 01 RPM sin cambios
- **GIVEN** `Elm327TcpRepository` construido con las nuevas ubicaciones de imports
- **WHEN** se invoca `repo.readPid("01", "0C")` con respuesta mock `"41 0C 0C 80"`
- **THEN** devuelve `800` (misma fórmula `(A*256+B)/4`, mismo comportamiento)

#### Scenario: readPid Mode 22 VAG sin cambios
- **GIVEN** `Elm327TcpRepository` construido con nuevas ubicaciones
- **WHEN** se invoca `repo.readPid("22", "1130")` con respuesta mock `"62 11 30 0C 80"`
- **THEN** devuelve `800` (fórmula desde `VAG_AUDI_MODE_22_PIDS` en seed, mismo comportamiento)

#### Scenario: Los 8 métodos públicos conservan firma
- **GIVEN** `Elm327TcpRepository` con imports actualizados
- **WHEN** se inspeccionan sus métodos públicos
- **THEN** `readPid`, `getSupportedPids`, `getFreezeFrame`, `readDtcCodes`, `clearDtcCodes`, `readVin`, `getVehicleInfo`, `setPower` conservan firma y comportamiento idénticos

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

---

### Requirement: Solo lectura forzada cuando hay un vehículo real conectado
El sistema SHALL impedir el borrado de códigos de avería (Mode 04) siempre que el modo de
conexión sea un adaptador físico —cable serie o dongle WiFi—, con independencia de la
configuración explícita de solo lectura. Es la única escritura del sistema y en un vehículo
real es irreversible: elimina códigos y freeze frames y reinicia los monitores de
emisiones. La configuración explícita SHALL seguir pudiendo activar el modo solo lectura
contra el emulador, pero NO SHALL poder desactivarlo frente a un vehículo real.

El rechazo SHALL explicar cuál de las dos causas lo motiva —configuración explícita o modo
de conexión— para que no se confunda con un fallo del adaptador.

#### Scenario: El borrado se rechaza en un coche real aunque no se haya configurado
- **GIVEN** una conexión por adaptador físico y la configuración de solo lectura desactivada
- **WHEN** se solicita el borrado de códigos de avería
- **THEN** la petición se rechaza antes de llegar al bus del vehículo
- **AND** el motivo indica que la causa es el modo de conexión, no la configuración

#### Scenario: Con el emulador, el borrado sigue disponible
- **GIVEN** una conexión al emulador y la configuración de solo lectura desactivada
- **WHEN** se solicita el borrado de códigos de avería
- **THEN** la petición se cursa igual que hasta ahora

#### Scenario: La configuración explícita sigue vigente sobre el emulador
- **GIVEN** una conexión al emulador y la configuración de solo lectura activada
- **WHEN** se solicita el borrado de códigos de avería
- **THEN** la petición se rechaza
- **AND** el motivo indica que la causa es la configuración

#### Scenario: Los servicios de control siguen bloqueados en todos los modos
- **GIVEN** cualquier modo de conexión y cualquier configuración de solo lectura
- **WHEN** se intenta emitir un servicio de control (reinicio de ECU, control de actuador, escritura de datos)
- **THEN** se rechaza antes de alcanzar el bus, como ya ocurre hoy
- **AND** esta protección es independiente de la de Mode 04
