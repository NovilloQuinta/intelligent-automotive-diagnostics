# DTC Repair Tips Screen

## Purpose

Panel del dashboard "Tips de Reparación": al seleccionar un DTC (en cualquiera de las tres pestañas de `DtcPanel` — Almacenadas/Pendientes/Permanentes), muestra los resultados de búsqueda semántica del catálogo de conocimiento (`dtcsIndex` + `diagnosisIndex`, ADR-007) relacionados con ese código, inspirado en el "MaxiFix" de Autel MaxiSys. Accesible a cualquier usuario autenticado, no solo administradores — a diferencia del panel de prueba existente `/api/admin/knowledge/search`.

## Requirements

### Requirement: `GET /api/dtc-repair-tips` accesible a cualquier usuario autenticado

El sistema SHALL exponer `GET /api/dtc-repair-tips` en el namespace `/api/diagnosis` (montado tras `authMiddleware` global, sin `requireAdmin`), aceptando `scenarioId` (obligatorio en modo simulador, opcional en modo TCP/serial directo — mismo patrón que el resto de endpoints de diagnóstico), `code` (obligatorio) y `description` (opcional).

#### Scenario: Usuario autenticado sin rol admin puede consultar tips
- **GIVEN** un usuario autenticado con rol no-admin
- **WHEN** hace `GET /api/dtc-repair-tips?scenarioId=<id>&code=P0301&description=Misfire...`
- **THEN** recibe `200` con la lista de tips (o vacía), sin `403`

#### Scenario: Sin token de acceso
- **GIVEN** ninguna petición autenticada
- **WHEN** se llama a `GET /api/dtc-repair-tips`
- **THEN** el `authMiddleware` global responde antes de llegar al controlador (mismo comportamiento que `/api/freeze-frame`, `/api/ecu-info`)

#### Scenario: `scenarioId` inexistente
- **GIVEN** un `scenarioId` que no corresponde a ningún escenario ni al modo directo activo
- **WHEN** se llama al endpoint
- **THEN** responde `404` con el mismo error `Scenario not found` que usan `freezeFrame`/`ecuInfo`

#### Scenario: `code` ausente
- **GIVEN** una petición sin query param `code`
- **WHEN** se llama al endpoint
- **THEN** responde `400` con detalle de validación

---

### Requirement: Búsqueda combinada en `dtcsIndex` y `diagnosisIndex`, degradación independiente por índice

El sistema SHALL construir el texto de búsqueda como `"<code>: <description>"` (o solo `<code>` si no hay descripción) y buscar en paralelo en `KnowledgeStack.dtcsIndex` y `KnowledgeStack.diagnosisIndex`, combinando los resultados etiquetados por `source` (`'dtc' | 'diagnosis'`) y ordenados por distancia ascendente. Un fallo en un índice SHALL NOT vaciar los resultados del otro.

#### Scenario: Ambos índices devuelven resultados
- **GIVEN** `dtcsIndex.search()` devuelve 2 resultados y `diagnosisIndex.search()` devuelve 3
- **WHEN** se ejecuta `GetDtcRepairTipsUseCase`
- **THEN** el resultado combinado tiene 5 elementos, cada uno con `source` correcto, ordenados por `distance` ascendente

#### Scenario: Un índice falla, el otro sigue funcionando
- **GIVEN** `dtcsIndex.search()` rechaza (LanceDB no disponible transitoriamente) y `diagnosisIndex.search()` devuelve 2 resultados
- **WHEN** se ejecuta `GetDtcRepairTipsUseCase`
- **THEN** el resultado combinado tiene los 2 elementos de `diagnosisIndex`, sin excepción propagada
- **AND** se registra un aviso vía `logger.warn`, no un error

#### Scenario: Ningún índice devuelve resultados
- **GIVEN** ambas búsquedas devuelven `[]`
- **WHEN** se ejecuta `GetDtcRepairTipsUseCase`
- **THEN** el resultado combinado es `[]`, sin error

#### Scenario: Texto de búsqueda con descripción
- **GIVEN** `code: 'P0301'`, `description: 'Misfire Detected Cylinder 1'`
- **WHEN** se construye el texto de búsqueda
- **THEN** es `"P0301: Misfire Detected Cylinder 1"`

#### Scenario: Texto de búsqueda sin descripción
- **GIVEN** `code: 'P0301'`, sin `description`
- **WHEN** se construye el texto de búsqueda
- **THEN** es `"P0301"`

---

### Requirement: Acotación opcional por fabricante/modelo del vehículo activo

El sistema SHALL acotar ambas búsquedas por `{ manufacturer, model }` del vehículo activo (resuelto vía `DiagnosisService.getVehicleInfo(scenarioId)`) cuando `make !== 'unknown'`, y SHALL buscar sin filtro cuando el vehículo no está identificado (modo TCP/serial directo sin descriptor).

#### Scenario: Vehículo identificado (modo simulador)
- **GIVEN** el escenario activo resuelve a `make: 'Audi', model: 'A3'`
- **WHEN** se ejecuta la búsqueda de tips
- **THEN** ambas llamadas a `search()` reciben `filter: { manufacturer: 'Audi', model: 'A3' }`

#### Scenario: Vehículo no identificado (modo TCP/serial directo)
- **GIVEN** el escenario activo resuelve a `make: 'unknown', model: 'unknown'`
- **WHEN** se ejecuta la búsqueda de tips
- **THEN** ambas llamadas a `search()` se hacen sin `filter` (o `filter: undefined`)

---

### Requirement: Flag de capacidad `knowledgeBase` en `GET /api/mcp/capabilities`

El sistema SHALL extender la respuesta de `GET /api/mcp/capabilities` con `knowledgeBase: boolean`, `true` cuando `DiagnosisService` tiene un `KnowledgeStack` configurado (mismo patrón que la flag existente `cognitiveDiagnosis`).

#### Scenario: Catálogo configurado
- **GIVEN** `DiagnosisService` fue construido con `knowledgeStack` definido
- **WHEN** se llama a `GET /api/mcp/capabilities`
- **THEN** la respuesta incluye `knowledgeBase: true`

#### Scenario: Catálogo no configurado
- **GIVEN** `DiagnosisService` fue construido sin `knowledgeStack` (p. ej. `LANCEDB_PATH` no accesible al arrancar)
- **WHEN** se llama a `GET /api/mcp/capabilities`
- **THEN** la respuesta incluye `knowledgeBase: false`
- **AND** `GET /api/dtc-repair-tips` sigue respondiendo `200` con `tips: []`, no un error

---

### Requirement: Nueva sección `repair-tips` en el dashboard

El sistema SHALL añadir `'repair-tips'` a `SidebarSection` y un `case 'repair-tips'` en `DashboardSection` que renderice `DtcRepairTipsPanel`, alimentado por el mismo `selectedDtc` que ya usa la sección `freeze-frame`, sin nueva ruta TanStack.

#### Scenario: La pestaña aparece en el sidebar
- **GIVEN** el usuario autenticado con un vehículo seleccionado
- **WHEN** se renderiza el `Sidebar`
- **THEN** aparece un ítem "Tips Reparación" (o etiqueta equivalente)

#### Scenario: Sin DTC seleccionado
- **GIVEN** el usuario navega a la sección `repair-tips` sin haber seleccionado ningún DTC
- **WHEN** se renderiza `DtcRepairTipsPanel`
- **THEN** muestra un estado vacío invitando a seleccionar un código DTC

#### Scenario: DTC seleccionado desde cualquier pestaña de `DtcPanel`
- **GIVEN** el usuario selecciona un código en la pestaña "Pendientes" (Mode 07) de `DtcPanel`
- **WHEN** navega a la sección `repair-tips`
- **THEN** `DtcRepairTipsPanel` consulta tips para ese código, igual que si viniera de "Almacenadas"

---

### Requirement: `DtcRepairTipsPanel` muestra origen, distancia y metadatos de cada tip

El sistema SHALL renderizar cada resultado con una indicación visual de su `source` (`'dtc'` → "Significado del código", `'diagnosis'` → "Caso resuelto previo"), el texto (`embeddedText`), fabricante/modelo, y la distancia de similitud.

#### Scenario: Resultado de tipo `dtc`
- **GIVEN** un tip con `source: 'dtc'`
- **WHEN** se renderiza su tarjeta
- **THEN** muestra la etiqueta "Significado del código"

#### Scenario: Resultado de tipo `diagnosis`
- **GIVEN** un tip con `source: 'diagnosis'`
- **WHEN** se renderiza su tarjeta
- **THEN** muestra la etiqueta "Caso resuelto previo"

#### Scenario: Base de conocimiento no disponible
- **GIVEN** `useCapabilities().knowledgeBase === false`
- **WHEN** se renderiza `DtcRepairTipsPanel` con un DTC seleccionado
- **THEN** muestra un estado informativo de no disponibilidad, sin intentar la llamada a `GET /api/dtc-repair-tips`

#### Scenario: Sin resultados en el catálogo
- **GIVEN** `knowledgeBase: true` y la respuesta trae `tips: []`
- **WHEN** se renderiza `DtcRepairTipsPanel`
- **THEN** muestra un estado vacío distinto al de "no disponible" ("Sin resultados para este código todavía")

---

### Requirement: `DtcPanel` propaga la descripción del DTC seleccionado

El sistema SHALL ensanchar `DtcPanel`'s `onSelect` a `(code: string, description?: string) => void`, de forma retrocompatible, para que `DashboardPage` pueda construir un texto de búsqueda más informativo que el código pelado.

#### Scenario: Selección propaga código y descripción
- **GIVEN** el usuario hace click en un DTC con `code: 'P0301'`, `description: 'Misfire Detected Cylinder 1'`
- **WHEN** se invoca `onSelect`
- **THEN** se llama con `('P0301', 'Misfire Detected Cylinder 1')`

#### Scenario: Comportamiento existente de `freeze-frame` no cambia
- **GIVEN** el usuario selecciona un DTC
- **WHEN** `DashboardPage.handleDtcSelect` procesa la selección
- **THEN** la navegación a la sección `freeze-frame` y el valor de `selectedDtc` pasado a `FreezeFramePanel` se comportan exactamente igual que antes de este cambio
