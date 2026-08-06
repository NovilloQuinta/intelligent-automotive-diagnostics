# Elm327 TCP Repository

## Purpose

Adaptador OBD-II sobre TCP que implementa `ObdRepositoryPort` para comunicarse con el emulador ELM327 Docker. El transporte TCP usa una **conexión persistente** (un solo socket compartido para todas las peticiones, con cola de comandos serializada y auto-reconexión con backoff exponencial) en lugar de sockets efímeros por comando.

## MODIFIED Requirements

### Requirement: Conexión TCP persistente al emulador ELM327 (MODIFIED)
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

## REMOVED Requirements

### Requirement: Circuit breaker (REMOVED)
El sistema YA NO implementa circuit breaker en `tcpTransport.ts`. La auto-reconexión con backoff exponencial reemplaza este mecanismo.

#### Scenario: Circuit breaker eliminado
- **GIVEN** el código de `tcpTransport.ts`
- **WHEN** se inspecciona el módulo
- **THEN** no existe `CircuitState`, `failureCount`, `openedAt`, `CIRCUIT_BREAKER_THRESHOLD`, `CIRCUIT_RESET_MS`
- **AND** no existen las funciones `openCircuit()`, `tryHalfOpen()`, `onSuccess()`, `onFailure()`
- **AND** `sendCommand` no rechaza comandos con mensaje "circuit open"

### Requirement: Sockets efímeros por comando (REMOVED)
El sistema YA NO abre un nuevo socket TCP por cada llamada a `sendCommand`.

#### Scenario: Un solo socket por cliente
- **GIVEN** un cliente TCP creado con `createElm327TcpClient(config)`
- **WHEN** se ejecutan 10 comandos consecutivos
- **THEN** `createConnection` se llama exactamente 1 vez (en `connect()`)
- **AND** todos los comandos comparten el mismo socket
