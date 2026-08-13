## Context

`EcuInfo[]` ya sale estructurado del backend (`GET /api/ecu-info?scenarioId=`, cambio archivado `2026-08-06-add-ecu-info-screen`) y ya se consume en el frontend vía `useEcuInfo(selectedId)` (`apps/ui/src/components/dashboard/useEcuInfo.ts`), que alimenta `EcuInfoPanel` (tabla). El dashboard (`apps/ui/src/components/dashboard/DashboardPage.tsx`) es una única ruta autenticada (`apps/ui/src/routes/index.tsx`) que renderiza `DashboardSection` conmutando sobre `SidebarSection` (`vehicle | live-data | dtc | freeze-frame | ecu | diagnosis | chat | report`) — no hay rutas TanStack por pantalla.

Datos disponibles hoy por `getEcuInfo()`:
- **Modo simulador** (`OBD_MODE=sync`, `ObdSimulatorRepository` → `SimulationScenario.ecus`): Audi A3 tiene 5 ECUs (`ECM, TCM, ABS, BCM, SRS`), Kawasaki Z900 tiene 3 (`ECM, ABS, IPC`).
- **Modo TCP directo** (`OBD_MODE=tcp`, `Elm327TcpRepository.getEcuInfo()`, pensado para un adaptador ELM327 conectado a un vehículo real): devuelve **una única `EcuInfo` sintética fija** (`Engine Control Unit`, `7E0`/`7E8`, `ISO 15765-4 (CAN 11/500)`) porque el adaptador mantiene una sola conexión TCP sin routing CAN por ECU — no hace descubrimiento multi-ECU. Esta limitación está documentada en `openspec/changes/archive/2026-08-06-add-ecu-info-screen/design.md` (Non-Goal #1) y en `openspec/specs/ecu-info-screen/spec.md`.
- **`isotp-transport`** (`openspec/specs/isotp-transport/spec.md`, implementado en `2026-08-01-add-isotp-transport-layer`) da la capa de framing/reassembly ISO 15765-2 necesaria para leer payloads multi-frame (p. ej. VIN) sobre CAN, pero **no está integrada en `Elm327TcpRepository`** — su propio spec dice literalmente `> TBD: Add detailed purpose when integrated with Elm327TcpRepository.` Es una pieza necesaria pero no suficiente para descubrimiento multi-ECU real: falta la orquestación de direccionamiento funcional UDS (Service 0x22/0x3E por dirección, broadcast `7DF`, timeouts de flow control, agregación de respuestas por ECU) que hoy no existe en ningún adaptador.

`EcuInfo.type` (`apps/core-api/src/domain/entities/ecuInfo.ts`) es un `string` libre, no un enum cerrado — cualquier paleta de color por tipo debe tener un fallback determinista para valores no catalogados.

No hay ninguna librería de grafos/diagramación en `apps/ui/package.json` (sin `react-flow`, `d3`, `cytoscape`, `vis-network`). El patrón existente para visualizaciones custom (`RpmGauge.tsx`, `CoolantBar.tsx`) es SVG/CSS inline con constantes en `types.ts` (`GAUGE`, `SVG_STROKES`, `GRADIENTS`).

## Goals / Non-Goals

**Goals:**
- Mapa visual color-coded de las ECUs del vehículo activo, como sección adicional del dashboard (no sustituye a `EcuInfoPanel`, la complementa).
- Degradación correcta con 1 ECU (modo TCP real hoy) y con 3–5 ECUs (modo simulador) — ningún layout roto o vacío en ninguno de los dos casos.
- Cero dependencias nuevas, cero cambios de dominio/backend.

**Non-Goals:**
- **No se integra descubrimiento multi-ECU real vía `isotp-transport` en `Elm327TcpRepository`.** Decisión explícita (ver Decisión 1 más abajo) — no es un "no hay camino disponible" como en el cambio anterior, sino una decisión deliberada de alcance: es un cambio de infraestructura/protocolo ortogonal a una pantalla de visualización, y debe vivir en su propio change.
- No se añade edición, reordenación manual ni persistencia de la disposición del mapa — solo lectura, layout calculado.
- No se sincroniza este mapa con `VehicleRepository`/`SqliteVehicleRepository` (mismo Non-Goal ya establecido en `add-ecu-info-screen`; el catálogo persistente sigue desconectado de los flujos de `scenarioId`).
- No se añade zoom/pan ni exportación de imagen — el número de nodos es pequeño (1–6 en los datos de demo actuales) y cabe en el panel sin necesidad de esas interacciones.

## Decisions

### 1. Descubrimiento multi-ECU real vía `isotp-transport`: fuera de alcance, follow-up explícito

**Elegido**: Este cambio consume `EcuInfo[]` tal cual lo devuelve `ObdRepository.getEcuInfo()` hoy, sin tocar `Elm327TcpRepository`. Se documenta como follow-up recomendado (no urgente) un change futuro tipo `add-isotp-multi-ecu-discovery` que reemplace la ECU sintética fija por un descubrimiento real (broadcast UDS `7DF` + reensamblado con `isotp-transport`), a implementar íntegramente en `infrastructure/elm327/`. Como `TopologyMapPanel` solo renderiza lo que `getEcuInfo()` devuelve, ese cambio futuro mejoraría automáticamente el mapa (más nodos reales) sin tocar una sola línea de este componente — la capa de presentación y la de descubrimiento de bus quedan desacopladas por el contrato `EcuInfo[]` ya existente.

**Por qué no entra en este cambio, aunque la capa de transporte ya exista** (a diferencia de `add-ecu-info-screen`, donde no había ningún camino real disponible): `isotp-transport` da framing/reassembly, no descubrimiento. Falta construir la orquestación de direccionamiento funcional UDS (envío a `7DF`, recolección de N respuestas de N ECUs con sus distintas `responseAddr`, timeouts y reintentos, mapeo de cada respuesta a un `type`/`name` de ECU) — trabajo de infraestructura de protocolo con su propio conjunto de tests de integración TCP/mock-socket, sin relación con render SVG. Mezclarlo en un change de "pantalla nueva de dashboard" violaría cohesión de propósito (un change, un motivo de cambio) y forzaría a `reviewer`/`security` a auditar simultáneamente protocolo CAN de bajo nivel y componentes React — dos superficies de riesgo muy distintas. Además, el valor de la pantalla no depende de ese descubrimiento: hoy mismo, con 3–5 ECUs de simulador, el mapa ya demuestra el patrón visual completo.

**Rechazado**: Integrar `isotp-transport` en `Elm327TcpRepository.getEcuInfo()` como parte de este mismo change. Ampliaría el alcance de una propuesta de UI a una reescritura de protocolo de bus, con testing de infraestructura (mocks de socket TCP, timing de flow control ISO-TP) desproporcionado frente al objetivo (una nueva sección visual), y retrasaría la entrega de valor de la pantalla — que no depende de tener descubrimiento real para ser útil (ya lo es hoy con datos de simulador).

### 2. Degradación 1 ECU (TCP real) vs 3–5 ECUs (simulador): el layout se adapta al conteo, no al modo

**Elegido**: `TopologyMapPanel` no distingue "modo TCP" de "modo simulador" — solo reacciona a `ecus.length`, exactamente como ya hace `EcuInfoPanel`. Reglas de layout:
  - `ecus.length === 0`: `PanelState state="empty"` — mismo mensaje que `EcuInfoPanel` ("Sin ECUs descubiertas" / "Selecciona un vehículo").
  - `ecus.length === 1`: un único nodo centrado sobre un segmento corto de bus (no una línea completa vacía a los lados), con una leyenda secundaria bajo el nodo: *"Única ECU detectada — el adaptador conectado no realiza descubrimiento multi-ECU"*. Esto comunica honestamente la limitación real (no es un bug ni una pantalla vacía).
  - `ecus.length >= 2`: línea de bus horizontal completa, nodos distribuidos con espaciado uniforme a lo largo del eje X, alternando arriba/abajo de la línea (patrón visual del "Topology Mapping" de Autel) para evitar solapamiento de etiquetas incluso con 5–6 nodos.
- **Por qué por conteo y no por modo**: acopla el componente a un dato que ya tiene (`ecus.length`) en vez de a una variable de entorno del servidor (`OBD_MODE`) que la UI ni siquiera conoce hoy. Es además forward-compatible: si el follow-up de la Decisión 1 se implementa y el modo TCP empieza a devolver 3 ECUs reales, el mapa las muestra correctamente sin cambios, porque nunca dependió del modo.

**Rechazado**: Ocultar la pestaña "Topology" completamente cuando solo hay 1 ECU. Perdería valor de demo en el único modo "real" del sistema hoy (TCP directo) y sería inconsistente con `EcuInfoPanel`, que sí muestra su tabla con 1 fila sin ocultarse.

### 3. Visualización: SVG + CSS inline, sin librería de grafos

**Elegido**: `TopologyMapPanel` dibuja el mapa con SVG inline (elementos `<line>`, `<circle>`/`<rect>`, `<text>`) más Tailwind para el contenedor, siguiendo el mismo patrón que `RpmGauge.tsx`/`CoolantBar.tsx` (constantes de layout en `types.ts` o un módulo dedicado, sin `useState` de posición — el layout se calcula puramente a partir de `ecus.length` en cada render). Un módulo `ecuTopologyColors.ts` mapea `EcuInfo.type` → color, con un color de fallback determinista (hash simple del string) para tipos no catalogados.

**Por qué no una librería como `react-flow`/`d3`/`cytoscape`**: el número de nodos es pequeño y acotado (1–6 en los datos de demo; el propio dominio no permite miles de ECUs), no hay necesidad de layout de fuerzas, arrastre, zoom/pan ni edición — todo lo que esas librerías resuelven y que aquí serían Non-Goals explícitos. Añadir una dependencia de grafos (varias decenas de KB mínimo) para un diagrama estático de bus lineal violaría KISS y el patrón ya establecido en el proyecto de resolver visualizaciones custom con SVG a medida. Si en el futuro el mapa necesitara interacción compleja (arrastrar nodos, layouts de fuerza con docenas de ECUs reales), sería el momento de reevaluar — no ahora.

**Rechazado**: `react-flow` (u otra librería de diagramas de nodos). Resuelve problemas (layout automático de grafos arbitrarios, edición interactiva) que este mapa no tiene: la topología es siempre "N nodos colgando de una línea de bus", un layout trivial de calcular a mano.

### 4. Ubicación: nueva sección `topology` en el dashboard existente, no nueva ruta

**Elegido**: Nueva entrada en `SidebarSection` (`apps/ui/src/components/layout/Sidebar.tsx`) y nuevo `case 'topology'` en `DashboardSection` (`apps/ui/src/components/dashboard/DashboardSection.tsx`), igual que `ecu`, `freeze-frame`, `report`. La única ruta autenticada (`apps/ui/src/routes/index.tsx`) sigue renderizando `DashboardPage`, que ya gestiona auth/wizard de selección de vehículo una sola vez para todas las secciones.

**Por qué no una ruta nueva**: todas las pantallas de dashboard añadidas hasta ahora (`ecu`, `freeze-frame`, `report`) siguen este patrón de sección-dentro-de-la-misma-ruta, reutilizando el guard de auth y el wizard de auto-detección de vehículo (`useVehicleAutoDetect`) ya resueltos una vez en `DashboardPage`. Crear una ruta `/topology` obligaría a duplicar ese guard y esa selección de vehículo, o a pasar `selectedId` por query string/contexto global — complejidad sin beneficio, ya que el mapa es una vista más del mismo vehículo activo, no un flujo independiente.

**Rechazado**: Pestaña/acordeón dentro de `EcuInfoPanel` (fusionar tabla + mapa en un solo panel). Se descarta porque `EcuInfoPanel` ya tiene su propio layout de tabla compacta pensado para la columna estrecha del dashboard; forzar un SVG de bus dentro de ese mismo panel limitaría demasiado el espacio horizontal disponible para distribuir los nodos. Una sección de ancho completo (como ya tienen `dtc`, `freeze-frame`, `report`) da más espacio para el diagrama.

## Data Model

Sin cambios. `TopologyMapPanel` consume el mismo tipo `EcuInfo` ya definido en `apps/ui/src/components/dashboard/types.ts`:

```typescript
export type EcuInfo = {
  id: number
  vehicleId: number
  name: string
  requestAddr: string
  responseAddr: string
  type: string
  protocol: string
  discoveredAt?: string
}
```

### Flujo de ejecución

```
Usuario ya tiene selectedId (vehículo activo, wizard.step === 'done')
  → useEcuInfo(selectedId)   // ya existe, sin cambios — mismo hook que EcuInfoPanel
  → TopologyMapPanel recibe { ecus, loading, error }
  → calcula layout puro a partir de ecus.length (0 / 1 / N≥2)
  → renderiza SVG: línea de bus + N nodos coloreados por ecuTopologyColors(type)
  → click en nodo → estado local `selectedEcuId` → tarjeta de detalle inline
```

## UI

`TopologyMapPanel` (`panel` CSS class, icono `lucide-react` tipo `Network`/`GitBranch`, animación `fade-up` en cada nodo con `animationDelay` escalonado — mismo patrón que `EcuTable` en `EcuInfoPanel.tsx`). Estados: vacío (sin vehículo o sin ECUs, vía `PanelState`), cargando, mapa renderizado. Layout SVG:

```
        ┌─ECM─┐              ┌─ABS─┐
        └──┬──┘              └──┬──┘
  ─────────┴──────────────────────┴───────────  ← línea de bus CAN
                │                    │
             ┌──┴──┐              ┌──┴──┐
             │ TCM │              │ SRS │
             └─────┘              └─────┘
```

Con 1 sola ECU, el mismo layout colapsa a un único nodo centrado sobre un segmento corto de línea, con la leyenda de limitación descrita en la Decisión 2. Detalle exacto de espaciado/posicionamiento SVG (coordenadas, radios, tipografía) es decisión de implementación libre para `writer`, siguiendo las constantes de layout ya usadas en `RpmGauge`/`CoolantBar` (`types.ts`).
