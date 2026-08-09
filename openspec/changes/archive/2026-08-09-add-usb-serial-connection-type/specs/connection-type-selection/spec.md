# Connection Type Selection

## Purpose

Permite al sistema conectarse a dispositivos ELM327 por USB/serial ademas del TCP existente, y muestra el tipo de conexion (WiFi, USB, Bluetooth) en la UI para que el mecanico sepa como esta conectado al vehiculo.

## Requirements

### Requirement: Interfaz comun de transporte ELM327
El sistema SHALL definir una interfaz `Elm327Transport` en `infrastructure/elm327/elm327Transport.ts` con los metodos `connect(): Promise<void>`, `sendCommand(cmd: string): Promise<string>` y `close(): Promise<void>`. Tanto `Elm327TcpClient` como `SerialTransport` SHALL implementar esta interfaz.

#### Scenario: Elm327TcpClient satisface la interfaz
- **GIVEN** `Elm327TcpClient` existe en `tcpTransport.ts`
- **WHEN** se verifica contra la interfaz `Elm327Transport`
- **THEN** `Elm327TcpClient` tiene los metodos `connect`, `sendCommand`, `close` con las firmas correctas

#### Scenario: Elm327Adapter recibe transporte por constructor
- **GIVEN** `Elm327TcpRepository` (adapter) en `elm327Adapter.ts`
- **WHEN** se construye con `new Elm327TcpRepository(transport)` donde `transport: Elm327Transport`
- **THEN** el adapter usa `transport.sendCommand()` para enviar comandos ELM327
- **AND** el adapter no crea el transporte internamente (no llama a `createElm327TcpClient`)

---

### Requirement: Transporte serial USB para ELM327
El sistema SHALL implementar `createElm327SerialClient(config: SerialConfig): Elm327Transport` en `infrastructure/elm327/serialTransport.ts` usando la biblioteca `serialport`. El cliente SHALL abrir un puerto serie, serializar comandos con cola FIFO + mutex, detectar el prompt `>` como delimitador de respuesta, aplicar timeout por comando, y reconectar automaticamente con backoff exponencial ante desconexion.

#### Scenario: Apertura de puerto serie y comando AT
- **GIVEN** un dispositivo ELM327 conectado en `/dev/ttyUSB0` a 38400 baud
- **WHEN** se crea `createElm327SerialClient({ path: '/dev/ttyUSB0', baudRate: 38400 })` y se llama `connect()`
- **AND** se envia `sendCommand("AT")`
- **THEN** se escribe `AT\r\n` al puerto serie
- **AND** se recibe `OK\r\r>` como respuesta

#### Scenario: Comando Mode 01 PID 0C (RPM)
- **GIVEN** un `SerialTransport` conectado y funcionando
- **WHEN** se envia `sendCommand("01 0C")`
- **THEN** se recibe respuesta en formato `41 0C XX XX\r\r>` con los bytes de datos

#### Scenario: Cola FIFO serializa comandos
- **GIVEN** un `SerialTransport` conectado
- **WHEN** se invoca `sendCommand("01 0C")` y `sendCommand("01 05")` en rapida sucesion
- **THEN** el primer comando se escribe al puerto inmediatamente
- **AND** el segundo comando se encola y NO se escribe hasta que el primero resuelve (recibe `>`)
- **AND** ambos comandos resuelven en orden con sus respuestas correctas

#### Scenario: Timeout de comando individual
- **GIVEN** un `SerialTransport` conectado
- **WHEN** se envia un comando y el dispositivo no responde en `timeout` ms (default 3000)
- **THEN** se rechaza el comando con `Elm327ConnectionError` indicando timeout
- **AND** se inicia reconexion automatica

#### Scenario: Shutdown graceful con close()
- **GIVEN** un `SerialTransport` conectado con comandos pendientes
- **WHEN** se invoca `close()`
- **THEN** el puerto serie se cierra
- **AND** todos los comandos pendientes se rechazan con `Elm327ConnectionError("Connection closed")`
- **AND** la reconexion automatica NO se activa

#### Scenario: Reconexion tras desconexion fisica
- **GIVEN** un `SerialTransport` conectado y funcionando
- **WHEN** el puerto serie emite evento `close` (dispositivo USB desconectado)
- **THEN** el cliente inicia reconexion automatica con backoff exponencial
- **AND** los comandos que lleguen durante la reconexion se encolan y esperan
- **WHEN** el dispositivo se reconecta (puerto vuelve a estar disponible)
- **THEN** el cliente reconecta exitosamente y procesa los comandos pendientes

---

### Requirement: Modo de operacion serial en el backend
El sistema SHALL soportar `OBD_MODE=serial` en la configuracion, controlado por las variables de entorno `SERIAL_PORT_PATH` (default `/dev/ttyUSB0`) y `SERIAL_BAUD_RATE` (default `38400`). En este modo, la composicion SHALL crear un `SerialTransport` y pasarlo al adapter.

#### Scenario: Composicion en modo serial
- **GIVEN** `OBD_MODE=serial` y `SERIAL_PORT_PATH=/dev/ttyUSB0`
- **WHEN** se ejecuta `buildApp(config)`
- **THEN** se crea `createElm327SerialClient({ path: '/dev/ttyUSB0', baudRate: 38400 })`
- **AND** se pasa al constructor de `Elm327TcpRepository`
- **AND** `DiagnosisService` recibe el repositorio como conexion directa (`obdRepo`, no `obdRepos`)

#### Scenario: Validacion de configuracion serial
- **GIVEN** `OBD_MODE=serial` sin `SERIAL_PORT_PATH`
- **WHEN** se ejecuta `loadConfig()`
- **THEN** `SERIAL_PORT_PATH` toma el valor por defecto `/dev/ttyUSB0`
- **AND** `SERIAL_BAUD_RATE` toma el valor por defecto `38400`

#### Scenario: Escenario sintetico serial
- **GIVEN** el servidor en modo `OBD_MODE=serial`
- **WHEN** se hace `GET /api/scenarios`
- **THEN** devuelve un escenario con `id: 'serial'`, `name: 'ELM327 USB Connection'`, `connectionType: 'usb'`

---

### Requirement: Campo connectionType en ScenarioDescriptor
El sistema SHALL incluir el campo `connectionType: 'wifi' | 'usb' | 'bluetooth'` en `ScenarioDescriptor` y exponerlo en la respuesta de `GET /api/scenarios`. Los escenarios docker y el modo TCP directo SHALL devolver `'wifi'`. El modo serial SHALL devolver `'usb'`.

#### Scenario: GET /api/scenarios en modo docker
- **GIVEN** `OBD_MODE=docker`
- **WHEN** se hace `GET /api/scenarios`
- **THEN** cada escenario (toyota, audi-a3-tdi, kawasaki-z900) tiene `connectionType: 'wifi'`

#### Scenario: GET /api/scenarios en modo tcp
- **GIVEN** `OBD_MODE=tcp`
- **WHEN** se hace `GET /api/scenarios`
- **THEN** el escenario `tcp` tiene `connectionType: 'wifi'`

#### Scenario: GET /api/scenarios en modo serial
- **GIVEN** `OBD_MODE=serial`
- **WHEN** se hace `GET /api/scenarios`
- **THEN** el escenario `serial` tiene `connectionType: 'usb'`

---

### Requirement: Indicador de tipo de conexion en la UI
El sistema SHALL mostrar el tipo de conexion (WiFi, USB, Bluetooth) en dos ubicaciones de la UI: el indicador `ConnectionStatus` del `TopBar` y el paso de seleccion de escenario del `VehicleAutoDetectWizard`.

#### Scenario: TopBar muestra icono de conexion
- **GIVEN** un escenario seleccionado con `connectionType: 'usb'`
- **WHEN** se renderiza el `TopBar`
- **THEN** se muestra un icono USB junto al `ConnectionStatus`
- **AND** el icono cambia segun `connectionType` (WiFi/USB/Bluetooth)

#### Scenario: Wizard muestra tipo de conexion
- **GIVEN** `GET /api/scenarios` devuelve escenarios con `connectionType`
- **WHEN** se renderiza el paso "Conexion" del wizard
- **THEN** cada `ConnectionButton` muestra el icono y tipo de conexion debajo del nombre del vehiculo

#### Scenario: Tipo bluetooth se renderiza aunque no este implementado
- **GIVEN** un escenario con `connectionType: 'bluetooth'` (futuro)
- **WHEN** se renderiza la UI
- **THEN** se muestra el icono Bluetooth correctamente
- **AND** no se produce ningun error de renderizado
