## Why

Hoy la app solo habla con un ELM327 por TCP (WiFi). Pero el 90% de los dongles ELM327 del mercado son USB-serial: se enchufan al portátil del mecánico y aparecen como `/dev/ttyUSB0`. Sin soporte serial, la demo del "coche real por cable" no funciona.

Además, la UI no sabe nada del tipo de conexión. El mecánico conecta un cable y la app le dice "ELM327 Direct Connection" sin decirle si es WiFi, USB o Bluetooth. Para una herramienta de taller, eso es confuso: necesitas saber por dónde estás conectado y poder verificarlo.

Dos cambios en uno porque comparten el mismo fichero de transporte y el mismo tipo de escenario. Separarlos en dos ramas sería coreografía innecesaria.

**Fuera de alcance:** Bluetooth RFCOMM. La arquitectura de transporte lo permite (misma interfaz, misma abstracción) pero el adaptador concreto para Bluetooth se deja para otro cambio. La UI sí muestra el tipo `bluetooth` desde el principio para no tener que retocarla después.

## What Changes

- **Interfaz común `Elm327Transport`** extraída de `tcpTransport.ts`: `connect()`, `sendCommand(cmd)`, `close()`. TCP y Serial la implementan.
- **`SerialTransport`** en `infrastructure/elm327/serialTransport.ts` usando `node-serialport`: abre puerto serie, configura baud rate, misma cola FIFO + mutex + reconexión que el TCP.
- **Nuevo modo `OBD_MODE=serial`** con variables `SERIAL_PORT_PATH` (default `/dev/ttyUSB0`) y `SERIAL_BAUD_RATE` (default `38400`).
- **Campo `connectionType`** en `ScenarioDescriptor` (`'wifi' | 'usb' | 'bluetooth'`), expuesto en `/api/scenarios`.
- **Indicador de tipo de conexión en la UI**: icono (WiFi/USB/Bluetooth) en el `ConnectionStatus` del TopBar y en el paso "Conexión" del wizard.
- **El wizard muestra `connectionType`** en el `ConnectionButton` de cada escenario: el mecánico ve de un vistazo cómo está conectado el vehículo.

## Capabilities

### New Capabilities
- `connection-type-selection`: Tipo de conexión del dispositivo ELM327 — WiFi (TCP), USB (serial) o Bluetooth — visible en el wizard y la barra de estado, y configurable desde backend.

## Dependencies

No depende de ningún cambio abierto. Se basa en `develop` tal cual está ahora.

## Impact

- Nuevo: `apps/core-api/src/infrastructure/elm327/elm327Transport.ts` (interfaz común)
- Modificado: `apps/core-api/src/infrastructure/elm327/tcpTransport.ts` (extraer interfaz, implementarla)
- Nuevo: `apps/core-api/src/infrastructure/elm327/serialTransport.ts` (SerialTransport + factory)
- Modificado: `apps/core-api/src/infrastructure/elm327/elm327Adapter.ts` (aceptar cualquier `Elm327Transport`)
- Modificado: `apps/core-api/src/infrastructure/configuration/index.ts` (+ serial config, + `OBD_MODE` enum)
- Modificado: `apps/core-api/src/infrastructure/composition/composition.ts` (modo serial wiring)
- Modificado: `apps/core-api/src/infrastructure/services/diagnosisService.ts` (`ScenarioDescriptor.connectionType`, `TCP_DIRECT_SCENARIO`)
- Modificado: `apps/ui/src/components/dashboard/types.ts` (`Scenario.connectionType`)
- Modificado: `apps/ui/src/components/layout/TopBar.tsx` (`ConnectionStatus` con icono)
- Modificado: `apps/ui/src/components/dashboard/VehicleAutoDetectWizard.tsx` (`ConnectionButton`)
- Modificado: `apps/ui/src/lib/api.ts`
- Nuevo: `apps/core-api/tests/infrastructure/elm327/serialTransport.test.ts`
- Modificado: tests existentes de `tcpTransport` y `elm327Adapter`
- Nuevo: `node-serialport` como dependencia de `apps/core-api`
