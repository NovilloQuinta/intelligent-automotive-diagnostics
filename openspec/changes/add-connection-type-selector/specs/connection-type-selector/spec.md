# Connection Type Selector

## Purpose

Permite al usuario final (mecánico) elegir el tipo de conexión al vehículo — WiFi (TCP/IP), USB (serial) o Bluetooth — desde el wizard de identificación de vehículo, sin necesidad de editar variables de entorno ni reiniciar el backend. Aplica exclusivamente al modo producción `OBD_MODE=tcp`.

## Requirements

### Requirement: Múltiples escenarios directos en modo TCP
El sistema SHALL exponer tres escenarios de conexión directa — WiFi TCP, USB Serial y Bluetooth — cuando `OBD_MODE=tcp`, en lugar del único escenario sintético `TCP_DIRECT_SCENARIO` actual. Los modos `docker` y `serial` SHALL mantener su comportamiento actual sin cambios.

#### Scenario: listScenarios devuelve 3 opciones en modo tcp
- **GIVEN** el backend configurado con `OBD_MODE=tcp`
- **WHEN** se hace `GET /api/scenarios`
- **THEN** la respuesta contiene 3 escenarios con ids `tcp-wifi`, `serial-usb`, `bluetooth`
- **AND** cada escenario tiene `vehicleType: 'unknown'`
- **AND** `tcp-wifi` tiene `connectionType: 'wifi'`
- **AND** `serial-usb` tiene `connectionType: 'usb'`
- **AND** `bluetooth` tiene `connectionType: 'bluetooth'`

#### Scenario: listScenarios en modo docker no cambia
- **GIVEN** el backend configurado con `OBD_MODE=docker`
- **WHEN** se hace `GET /api/scenarios`
- **THEN** la respuesta contiene 3 escenarios con ids `toyota`, `audi-a3-tdi`, `kawasaki-z900`
- **AND** todos tienen `connectionType: 'wifi'`

#### Scenario: listScenarios en modo serial no cambia
- **GIVEN** el backend configurado con `OBD_MODE=serial`
- **WHEN** se hace `GET /api/scenarios`
- **THEN** la respuesta contiene 1 escenario con id `serial` y `connectionType: 'usb'`

---

### Requirement: Resolución de repositorio por tipo de conexión
El sistema SHALL resolver el `ObdRepository` correcto según el `scenarioId` seleccionado por el usuario. `tcp-wifi` SHALL usar el transporte TCP, `serial-usb` SHALL usar el transporte serial. `bluetooth` SHALL devolver error 404 al no tener transporte implementado.

#### Scenario: Diagnóstico por WiFi usa transporte TCP
- **GIVEN** `OBD_MODE=tcp` y el usuario selecciona `scenarioId=tcp-wifi`
- **WHEN** se invoca cualquier operación de diagnóstico (readVin, getLiveData, diagnose)
- **THEN** el sistema usa el `Elm327TcpRepository` con transporte TCP conectado a `ELM327_HOST:ELM327_PORT`

#### Scenario: Diagnóstico por USB usa transporte serial
- **GIVEN** `OBD_MODE=tcp` y el usuario selecciona `scenarioId=serial-usb`
- **WHEN** se invoca cualquier operación de diagnóstico
- **THEN** el sistema usa el `Elm327TcpRepository` con transporte serial conectado a `SERIAL_PORT_PATH`

#### Scenario: Bluetooth devuelve error 404
- **GIVEN** `OBD_MODE=tcp` y el usuario selecciona `scenarioId=bluetooth`
- **WHEN** se hace `GET /api/vehicle-info?scenarioId=bluetooth`
- **THEN** la respuesta es 404 con `{ error: "Scenario not found" }`
- **AND** el wizard muestra el estado de error recuperable con botones "Reintentar" y "Elegir otro vehículo"

---

### Requirement: Comportamiento del wizard sin cambios en UI
El sistema SHALL mantener el `VehicleAutoDetectWizard` sin modificaciones. El paso `selecting` ya renderiza un `ConnectionButton` por cada escenario devuelto por `GET /api/scenarios`. El paso `detecting` ya maneja errores de conexión con reintento y navegación hacia atrás. La UI SHALL funcionar correctamente con 1, 2 o 3 escenarios sin cambios de código.

#### Scenario: Wizard muestra 3 opciones de conexión
- **GIVEN** `GET /api/scenarios` devuelve 3 escenarios en modo `tcp`
- **WHEN** se renderiza el paso `selecting` del wizard
- **THEN** se muestran 3 `ConnectionButton` — uno para WiFi, uno para USB, uno para Bluetooth
- **AND** cada botón muestra el icono de conexión correspondiente (`Wifi`, `Usb`, `Bluetooth`)
- **AND** cada botón muestra el label de conexión (`WiFi / TCP`, `USB / Serial`, `Bluetooth`)

#### Scenario: Error en detección permite volver atrás
- **GIVEN** el usuario selecciona `bluetooth` en el paso `selecting`
- **WHEN** el paso `detecting` falla con error 404
- **THEN** el wizard muestra el estado de error con mensaje y botones "Reintentar" y "Elegir otro vehículo"
- **AND** al pulsar "Elegir otro vehículo", el wizard vuelve al paso `selecting`

---

### Requirement: Backward compatibility de modos existentes
El sistema SHALL mantener el comportamiento de `OBD_MODE=docker` y `OBD_MODE=serial` idéntico al actual. `listScenarios()` SHALL devolver el mismo resultado que antes del cambio. `resolveRepository()` SHALL resolver los mismos `scenarioId`. Ningún test existente SHALL romperse.

#### Scenario: Modo docker sin cambios
- **GIVEN** `OBD_MODE=docker`
- **WHEN** se ejecuta la suite de tests existente de `diagnosisService`
- **THEN** todos los tests pasan sin modificaciones

#### Scenario: Modo serial sin cambios
- **GIVEN** `OBD_MODE=serial`
- **WHEN** se ejecuta la suite de tests existente de `diagnosisService`
- **THEN** todos los tests pasan sin modificaciones
