## Why

Hoy `OBD_MODE` es una variable de entorno que decide qué transporte se usa. En `OBD_MODE=tcp` (producción con coche real), el wizard de identificación muestra UN solo escenario (`TCP_DIRECT_SCENARIO`, `connectionType: 'wifi'`). En `OBD_MODE=serial`, muestra otro (`SERIAL_DIRECT_SCENARIO`, `connectionType: 'usb'`). El tipo de conexión se muestra en la UI como indicador, pero el mecánico no puede elegir entre WiFi, USB o Bluetooth — para cambiar de uno a otro tiene que editar `.env` y reiniciar el backend.

El design doc D4 de `add-usb-serial-connection-type` dijo explícitamente: *"No se añade un selector de tipo de conexión en la UI. La conexión se configura en el backend (variables de entorno)."* Esa decisión era correcta en su momento (MVP con un solo tipo de conexión activo), pero ahora necesitamos que el mecánico pueda elegir desde la UI sin tocar `.env`. La demo con coche real (semana del 10 de agosto) usa USB, pero el mismo despliegue en producción debería permitir alternar entre WiFi, USB y Bluetooth.

La UI ya maneja múltiples escenarios en el `VehicleAutoDetectWizard` (paso `selecting` renderiza un `ConnectionButton` por cada escenario). `ScenarioDescriptor` ya tiene `connectionType: 'wifi' | 'usb' | 'bluetooth'`. `resolveRepository()` ya busca por `scenarioId` en el mapa `obdRepos`. Todo lo necesario existe — solo hay que exponer más de un escenario directo en modo `tcp`.

## What Changes

- **`OBD_MODE=tcp` expone 3 escenarios directos** en `listScenarios()`: WiFi TCP (`tcp-wifi`), USB Serial (`serial-usb`) y Bluetooth (`bluetooth`, placeholder sin transporte). El mecánico elige desde el wizard.
- **`OBD_MODE=docker` y `OBD_MODE=serial` no cambian** — docker sigue con 3 escenarios de emulador, serial sigue con 1 escenario USB.
- **`DiagnosisService.listScenarios()`** gana una tercera rama: cuando hay `scenarios` poblados además de `obdRepo`, devuelve el array de escenarios en lugar del escenario sintético único.
- **`createDiagnosisService` en `composition.ts`** construye los 3 escenarios + 2 transports (TCP y Serial) + mapa `obdRepos` cuando `OBD_MODE=tcp`. Bluetooth no tiene transporte → `resolveRepository('bluetooth')` lanza `DiagnosisScenarioNotFoundError`, que el wizard maneja con su estado de error recuperable.
- **La UI no se modifica** — el wizard ya renderiza N escenarios, el `ConnectionTypeIcon` ya soporta los 3 tipos, y el estado de error ya permite volver atrás y elegir otro.

## Capabilities

### Modified Capabilities
- `connection-type-selector`: El usuario final elige WiFi, USB o Bluetooth desde el wizard de identificación de vehículo en modo producción (`OBD_MODE=tcp`), sin editar variables de entorno.

## Dependencies

No depende de ningún cambio abierto. Se basa en `develop` tal cual está ahora.

## Impact

- **Modificado**: `apps/core-api/src/infrastructure/composition/composition.ts` — rama `OBD_MODE=tcp` crea múltiples escenarios directos
- **Modificado**: `apps/core-api/src/infrastructure/services/diagnosisService.ts` — `listScenarios()` con tercera rama multi-direct
- **Sin cambios en UI**: `VehicleAutoDetectWizard.tsx`, `ConnectionTypeIcon.tsx`, `TopBar.tsx`, `types.ts`, `api.ts`
- **Sin cambios en**: `configuration/index.ts`, `Elm327Transport.ts`, `tcpTransport.ts`, `serialTransport.ts`, `elm327Adapter.ts`
- Tests correspondientes en `diagnosisService.test.ts` y `diagnosis.routes.test.ts`
