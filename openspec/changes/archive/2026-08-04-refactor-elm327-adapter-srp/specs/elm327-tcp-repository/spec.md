# Elm327 TCP Repository

## Purpose

Adaptador OBD-II sobre TCP que implementa `ObdRepositoryPort` para comunicarse con el emulador ELM327 Docker. El módulo `infrastructure/elm327/` se estructura en módulos SRP: errores (`errors.ts`), utilidades hex (`hexUtils.ts`), gramática del wire protocol (`protocol.ts`), catálogo de fórmulas SAE J1979 + VAG Mode 22 autocontenido (`pidFormulas.ts`), transporte TCP efímero (`tcpTransport.ts`) y el adapter como composition root (`elm327Adapter.ts`). El catálogo de fórmulas no depende de `persistence/sqlite/seed-pids.ts`.

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Conexión TCP al emulador ELM327 (MODIFIED)
El sistema SHALL implementar `Elm327TcpRepository` en `infrastructure/elm327/elm327Adapter.ts` que se conecte vía TCP al emulador ELM327 y envíe comandos OBD-II con terminador `\r\n`, delegando el socket efímero en `createElm327TcpClient` (`tcpTransport.ts`).

#### Scenario: Envío de comando Mode 01 exitoso
- **GIVEN** el emulador ELM327 está disponible en `localhost:35000`
- **WHEN** se invoca `readPid("01", "0C")`
- **THEN** se envía `01 0C\r\n` al socket TCP
- **AND** se recibe `41 0C 0C 80`
- **AND** se extraen los bytes de datos `[0x0C, 0x80]`
- **AND** se aplica la fórmula `(A*256+B)/4`
- **AND** se devuelve el valor físico 800

#### Scenario: Timeout de conexión
- **GIVEN** el emulador no responde en 3 segundos
- **WHEN** se invoca cualquier operación OBD
- **THEN** se lanza `Elm327ConnectionError` con mensaje descriptivo

#### Scenario: Conexión rechazada
- **GIVEN** el emulador no está corriendo en el puerto configurado
- **WHEN** se invoca cualquier operación OBD
- **THEN** se lanza `Elm327ConnectionError` indicando host:port
