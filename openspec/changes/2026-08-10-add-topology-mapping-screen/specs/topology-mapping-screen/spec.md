# Topology Mapping Screen

## Purpose

Pantalla "Mapa de Topología" en el dashboard: representación visual color-coded de las unidades de control (ECU) del vehículo activo distribuidas sobre una línea de bus CAN, inspirada en el "Topology Mapping" de Autel MaxiSys. Reutiliza sin cambios el mismo dato ya expuesto por `GET /api/ecu-info` (`EcuInfo[]`) que hoy alimenta `EcuInfoPanel` — es una vista adicional, no un dato nuevo.

## Requirements

### Requirement: Nueva sección `topology` en el dashboard

El sistema SHALL añadir `'topology'` a `SidebarSection` (`apps/ui/src/components/layout/Sidebar.tsx`) y un `case 'topology'` en `DashboardSection` que renderice `TopologyMapPanel`, siguiendo el mismo patrón de sección-dentro-de-la-misma-ruta que `ecu`, `freeze-frame` y `report` (sin nueva ruta TanStack).

#### Scenario: La pestaña aparece en el sidebar
- **GIVEN** el usuario autenticado con un vehículo seleccionado
- **WHEN** se renderiza el `Sidebar`
- **THEN** aparece un ítem "Topología" (o etiqueta equivalente) junto a "Unidades Control"

#### Scenario: Seleccionar la pestaña activa la sección
- **GIVEN** el usuario en el dashboard
- **WHEN** hace click en el ítem "Topología" del sidebar
- **THEN** `DashboardSection` renderiza `TopologyMapPanel` en vez de la sección previamente activa

---

### Requirement: `TopologyMapPanel` reutiliza `useEcuInfo` sin nuevo endpoint

El sistema SHALL implementar `TopologyMapPanel` consumiendo el hook `useEcuInfo(selectedId)` ya existente (mismo dato que `EcuInfoPanel`), sin invocar ningún endpoint nuevo ni modificar `ObdRepository`.

#### Scenario: Cambio de vehículo recarga el mapa
- **GIVEN** el usuario cambia de vehículo seleccionado en `VehicleSelector`
- **WHEN** `useEcuInfo` resuelve el nuevo `GET /api/ecu-info?scenarioId=<id>`
- **THEN** `TopologyMapPanel` redibuja el mapa con las ECUs del nuevo vehículo, sin requerir pulsar "Diagnosticar"

#### Scenario: Sin vehículo seleccionado
- **GIVEN** ningún vehículo seleccionado
- **WHEN** se renderiza `TopologyMapPanel`
- **THEN** muestra un estado vacío (`PanelState state="empty"`) invitando a seleccionar un vehículo

---

### Requirement: Layout del mapa se adapta al número de ECUs, no al modo de conexión

El sistema SHALL calcular el layout del diagrama únicamente a partir de `ecus.length` (0, 1, o ≥2), sin distinguir si el origen es modo simulador o modo TCP directo.

#### Scenario: Sin ECUs descubiertas
- **GIVEN** `useEcuInfo` devuelve `ecus: []` para el vehículo seleccionado
- **WHEN** se renderiza `TopologyMapPanel`
- **THEN** muestra un estado vacío equivalente al de `EcuInfoPanel` ("Sin ECUs descubiertas"), no un diagrama roto

#### Scenario: Una única ECU (modo TCP directo hoy)
- **GIVEN** `useEcuInfo` devuelve exactamente 1 `EcuInfo`
- **WHEN** se renderiza `TopologyMapPanel`
- **THEN** muestra un único nodo centrado sobre un segmento corto de bus
- **AND** muestra una leyenda indicando que es la única ECU detectada porque el adaptador conectado no realiza descubrimiento multi-ECU

#### Scenario: Varias ECUs (modo simulador, escenario Audi A3)
- **GIVEN** `useEcuInfo` devuelve 5 `EcuInfo` (`ECM, TCM, ABS, BCM, SRS`)
- **WHEN** se renderiza `TopologyMapPanel`
- **THEN** dibuja una línea de bus horizontal completa con 5 nodos distribuidos uniformemente, alternando por encima/debajo de la línea, sin solapamiento de etiquetas

#### Scenario: Varias ECUs (modo simulador, escenario Kawasaki Z900)
- **GIVEN** `useEcuInfo` devuelve 3 `EcuInfo` (`ECM, ABS, IPC`)
- **WHEN** se renderiza `TopologyMapPanel`
- **THEN** dibuja una línea de bus horizontal con 3 nodos distribuidos, mismo patrón que el escenario de 5 ECUs

---

### Requirement: Color-coding por tipo de ECU con fallback determinista

El sistema SHALL exponer una función `getEcuTopologyColor(type: string): string` en `apps/ui/src/components/dashboard/ecuTopologyColors.ts` que devuelva un color fijo para los tipos catalogados (`ECM`, `TCM`, `ABS`, `BCM`, `SRS`, `IPC`) y un color de fallback determinista (mismo `type` → mismo color en toda la sesión) para cualquier otro valor de `type`.

#### Scenario: Tipo catalogado
- **WHEN** se invoca `getEcuTopologyColor('ECM')`
- **THEN** devuelve el color fijo asignado a motor/powertrain

#### Scenario: Tipo no catalogado
- **WHEN** se invoca `getEcuTopologyColor('UNKNOWN_TYPE')`
- **THEN** devuelve un color de fallback válido (no `undefined`, no excepción)
- **AND** invocaciones repetidas con el mismo `type` devuelven siempre el mismo color

#### Scenario: Nodo del mapa usa el color de su tipo
- **GIVEN** una `EcuInfo` con `type: 'ABS'`
- **WHEN** se renderiza su nodo en `TopologyMapPanel`
- **THEN** el nodo usa el color devuelto por `getEcuTopologyColor('ABS')`

---

### Requirement: Selección de nodo muestra detalle inline

El sistema SHALL permitir seleccionar un nodo del mapa (click) para mostrar una tarjeta de detalle con nombre, direcciones CAN de petición/respuesta y protocolo, como estado local del componente (sin elevar la selección a `DashboardPage`).

#### Scenario: Click en un nodo muestra su detalle
- **GIVEN** un mapa renderizado con al menos 2 ECUs
- **WHEN** el usuario hace click en el nodo de una ECU
- **THEN** aparece una tarjeta con su nombre, `requestAddr → responseAddr` y `protocol`

#### Scenario: Click en otro nodo cambia la selección
- **GIVEN** una ECU ya seleccionada con su tarjeta de detalle visible
- **WHEN** el usuario hace click en un nodo distinto
- **THEN** la tarjeta de detalle se actualiza con los datos de la nueva ECU seleccionada, sin recargar el mapa
