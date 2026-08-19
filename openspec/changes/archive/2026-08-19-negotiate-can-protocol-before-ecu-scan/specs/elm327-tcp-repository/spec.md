# Elm327 TCP Repository

## Purpose

Adaptador OBD-II sobre TCP que implementa `ObdRepositoryPort` para comunicarse con el emulador ELM327 Docker. El módulo `infrastructure/elm327/` se estructura en módulos SRP: errores (`errors.ts`), utilidades hex (`hexUtils.ts`), gramática del wire protocol (`protocol.ts`), catálogo de fórmulas SAE J1979 + VAG Mode 22 autocontenido (`pidFormulas.ts`), transporte TCP persistente (`tcpTransport.ts`) y el adapter como composition root (`elm327Adapter.ts`). El catálogo de fórmulas se construye desde `ALL_SEED_PIDS` vía `pidDefinitionsToFormulaEntries()` con imports desde `application/ports/` y `application/shared/`.

## ADDED Requirements

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
