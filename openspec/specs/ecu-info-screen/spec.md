# Ecu Info Screen

## Purpose

Pantalla "Información de ECU" en el dashboard: lista las unidades de control electrónico del vehículo activo (nombre, direcciones CAN de petición/respuesta, tipo, protocolo), alimentada en tiempo real por el mismo repositorio OBD-II que el resto de datos del vehículo (`VehicleInfo`, `DtcCode`, `FreezeFrame`).

## Requirements

### Requirement: ObdRepository expone getEcuInfo()
El sistema SHALL exponer `getEcuInfo(): Promise<EcuInfo[]>` en el puerto `ObdRepository`, implementado por `ObdSimulatorRepository` (desde `SimulationScenario.ecus`) y por `Elm327TcpRepository` (auto-scan CAN por functional addressing).

#### Scenario: Escenario simulado con ECUs definidas
- **GIVEN** un `SimulationScenario` con `ecus: [{ name: 'ECM', requestAddr: '7E0', responseAddr: '7E8', ... }]`
- **WHEN** se invoca `ObdSimulatorRepository.getEcuInfo()`
- **THEN** devuelve un array con esa `EcuInfo`

#### Scenario: Escenario simulado sin ECUs definidas
- **GIVEN** un `SimulationScenario` sin campo `ecus`
- **WHEN** se invoca `getEcuInfo()`
- **THEN** devuelve `[]` (no lanza error)

#### Scenario: Modo TCP directo
- **GIVEN** un `Elm327TcpRepository` conectado a un bus CAN
- **WHEN** se invoca `getEcuInfo()`
- **THEN** devuelve las ECUs realmente descubiertas por el auto-scan (≥1 según el bus), mapeando `7E8` a ECM y el resto a `UNKNOWN`

---

### Requirement: Tool MCP get_ecu_info
El sistema SHALL registrar una 7ª tool MCP `get_ecu_info` en `mcpServer.ts` que devuelva la lista de ECUs como texto narrativo, disponible para el diagnóstico cognitivo LLM.

#### Scenario: Diagnóstico cognitivo cita la ECU
- **GIVEN** un escenario con una ECU `Engine Control Unit` (7E0/7E8)
- **WHEN** el LLM invoca la tool `get_ecu_info` durante una sesión de diagnóstico cognitivo
- **THEN** recibe un texto con el nombre, direcciones y protocolo de la ECU

#### Scenario: listTools() incluye la nueva tool
- **GIVEN** `createMcpServer(repo)`
- **WHEN** se invoca `listTools()`
- **THEN** el array incluye una definición `get_ecu_info` junto a las 6 tools existentes

---

### Requirement: Endpoint GET /api/ecu-info
El sistema SHALL exponer `GET /api/ecu-info?scenarioId=` que devuelva `{ ecus: EcuInfo[] }` estructurado (no el texto narrativo de la tool MCP), resolviendo el repositorio igual que `POST /api/diagnosis`.

#### Scenario: ECUs de un escenario válido
- **GIVEN** un escenario `audi-a3-idle` con al menos una ECU de demo
- **WHEN** se hace `GET /api/ecu-info?scenarioId=audi-a3-idle`
- **THEN** responde 200 con `{ ecus: [...] }` con al menos un elemento

#### Scenario: Escenario inexistente
- **WHEN** se hace `GET /api/ecu-info?scenarioId=no-existe`
- **THEN** responde 404 con `{ error: "Scenario not found" }`

#### Scenario: Falta scenarioId en modo simulación
- **WHEN** se hace `GET /api/ecu-info` sin query param, con el servidor en modo simulación (sin `obdRepo` TCP)
- **THEN** responde 400 con detalles Zod

#### Scenario: Modo TCP directo sin scenarioId
- **GIVEN** un servidor con `obdRepo` (modo TCP directo)
- **WHEN** se hace `GET /api/ecu-info` sin query param
- **THEN** responde 200 con las ECUs descubiertas por el auto-scan del adaptador TCP

---

### Requirement: Panel de ECUs en el dashboard
El sistema SHALL mostrar un componente `EcuInfoPanel` en `DashboardPage` que liste las ECUs del vehículo seleccionado, cargando los datos automáticamente al cambiar de vehículo (sin requerir pulsar "Diagnosticar").

#### Scenario: Selección de vehículo carga ECUs
- **GIVEN** el usuario autenticado en el dashboard
- **WHEN** selecciona un vehículo en `VehicleSelector`
- **THEN** `EcuInfoPanel` invoca `GET /api/ecu-info?scenarioId=<id>` y muestra la tabla de ECUs

#### Scenario: Sin vehículo seleccionado
- **GIVEN** ningún vehículo seleccionado
- **WHEN** se renderiza `EcuInfoPanel`
- **THEN** muestra un estado vacío invitando a seleccionar un vehículo

#### Scenario: Vehículo sin ECUs
- **GIVEN** un escenario cuya respuesta `GET /api/ecu-info` devuelve `{ ecus: [] }`
- **WHEN** se renderiza `EcuInfoPanel`
- **THEN** muestra un mensaje "sin ECUs descubiertas" (equivalente al `NoCodesMessage` de `DtcPanel`)
