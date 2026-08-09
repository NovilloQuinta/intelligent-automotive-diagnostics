# Vehicle Autodetect Flow

## Purpose

Flujo de identificación de vehículo (lectura y decodificación de VIN vía `ObdRepository.readVin()`/`getVehicleInfo()`) como paso obligatorio tipo wizard antes de acceder al menú de diagnóstico, reemplazando la selección automática/instantánea actual del primer escenario.

## Requirements

### Requirement: Endpoint GET /api/vehicle-info
El sistema SHALL exponer `GET /api/vehicle-info?scenarioId=` que devuelva el VIN y los datos del vehículo activo, incluyendo los campos derivados del VO `Vin` (`manufacturer`, `region`, `modelYearDecoded`).

#### Scenario: Vehículo identificado en modo simulación
- **GIVEN** el escenario `audi-a3-idle` con VIN `WAUZZZ8V5JA123456`
- **WHEN** se hace `GET /api/vehicle-info?scenarioId=audi-a3-idle`
- **THEN** responde 200 con `{ vin: 'WAUZZZ8V5JA123456', make: 'Audi', model: 'A3', year: 2018, engineType: '2.0 TFSI', manufacturer: 'Audi', region: {...}, modelYearDecoded: 2018 }`

#### Scenario: Escenario inexistente
- **WHEN** se hace `GET /api/vehicle-info?scenarioId=no-existe`
- **THEN** responde 404 con `{ error: "Scenario not found" }`

#### Scenario: Modo TCP directo con VIN no decodificable
- **GIVEN** un `Elm327TcpRepository` cuya lectura de VIN falla o devuelve `FALLBACK_VIN`
- **WHEN** se hace `GET /api/vehicle-info`
- **THEN** responde 200 con `manufacturer: null`, `region: null`, `modelYearDecoded: null`, y `make`/`model`/`year`/`engineType` en sus valores de fallback (`'unknown'`/`0`)

---

### Requirement: Wizard de identificación de vehículo
El sistema SHALL mostrar un wizard de 3 pasos (`selecting` → `detecting` → `confirming`) antes de dar acceso al menú de diagnóstico (`TelemetrySection`/`DtcPanel`/`DiagnosisPanel`), sustituyendo la auto-selección instantánea actual del primer escenario.

#### Scenario: Flujo completo de identificación
- **GIVEN** el usuario abre el dashboard sin vehículo seleccionado
- **WHEN** elige un escenario/conexión en el paso `selecting`
- **THEN** el wizard pasa a `detecting`, invoca `GET /api/vehicle-info?scenarioId=<id>`, y al resolver pasa a `confirming` mostrando el vehículo identificado

#### Scenario: Confirmación entra al menú de diagnóstico
- **GIVEN** el wizard en el paso `confirming` con un vehículo identificado
- **WHEN** el usuario pulsa "Entrar a diagnóstico"
- **THEN** se fija `selectedId` y se monta el layout de diagnóstico existente (telemetría, DTCs, diagnóstico IA)

#### Scenario: useScenarios ya no auto-selecciona
- **GIVEN** `GET /api/scenarios` responde con escenarios disponibles
- **WHEN** `useScenarios` recibe la respuesta
- **THEN** `selectedId` permanece vacío hasta que el usuario complete el wizard (a diferencia del comportamiento actual, que seleccionaba `data[0].id` automáticamente)

---

### Requirement: Cambio de vehículo reabre el wizard
El sistema SHALL hacer que seleccionar un vehículo distinto desde `VehicleSelector` (una vez dentro del menú de diagnóstico) reabra el wizard de identificación en vez de cambiar el escenario activo directamente.

#### Scenario: Cambiar de vehículo desde el dropdown
- **GIVEN** el usuario ya dentro del menú de diagnóstico con el escenario `audi-a3-idle`
- **WHEN** selecciona `kawa-z900` en `VehicleSelector`
- **THEN** el wizard vuelve al estado `detecting` para `kawa-z900` antes de mostrar su telemetría
