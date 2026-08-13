## Why

Autel MaxiSys incluye una pantalla "Topology Mapping": un mapa visual de las unidades de control (ECU) conectadas al bus CAN del vehículo, color-coded por sistema (motor, transmisión, chasis, carrocería, seguridad, instrumentación). Hoy el dashboard ya expone esos mismos datos — `GET /api/ecu-info` devuelve `EcuInfo[]` (nombre, direcciones CAN de petición/respuesta, tipo, protocolo) — pero solo en formato tabla plana (`EcuInfoPanel`). Una tabla no comunica cómo se relacionan las ECUs entre sí sobre el bus, que es justo el valor diferencial del "Topology Mapping" de Autel frente a una simple lista.

No hace falta ni un dato nuevo ni un endpoint nuevo: el mismo `EcuInfo[]` que ya alimenta `EcuInfoPanel` (vía `useEcuInfo`) es suficiente para dibujar el mapa. Este cambio es, por tanto, una capability puramente de UI: una representación visual alternativa de datos que el sistema ya expone.

## What Changes

- **Nueva sección del dashboard `topology`**: pestaña adicional en el `Sidebar` (junto a "Unidades Control"), sin nueva ruta — sigue el mismo patrón que `ecu`, `freeze-frame` y `report` (secciones dentro de la única ruta autenticada `/`, no rutas TanStack independientes).
- **Nuevo componente `TopologyMapPanel`** (`apps/ui/src/components/dashboard/TopologyMapPanel.tsx`): dibuja las ECUs devueltas por `useEcuInfo(selectedId)` (el mismo hook que ya usa `EcuInfoPanel`, sin cambios) como un diagrama SVG de bus CAN — línea horizontal central ("CAN Bus") con nodos de ECU distribuidos y conectados por un tramo vertical, alternando por encima/debajo de la línea. Sin nueva dependencia: SVG + CSS inline, mismo patrón que `RpmGauge`/`CoolantBar`.
- **Color-coding por tipo de ECU** (`apps/ui/src/components/dashboard/ecuTopologyColors.ts`): paleta fija para los tipos de demo conocidos (`ECM`, `TCM`, `ABS`, `BCM`, `SRS`, `IPC`) más un color neutro determinista de fallback para cualquier `type` no reconocido (el dominio no restringe `EcuInfo.type` a un enum cerrado).
- **Degradación con 1 sola ECU**: en modo TCP directo (vehículo real hoy), `getEcuInfo()` devuelve una única ECU sintética. El mapa debe renderizar ese caso como un único nodo centrado sobre el bus con una nota explicativa ("única ECU detectada"), no como un layout roto o vacío pensado para 3–5 nodos.
- **Selección de nodo**: click en un nodo muestra una tarjeta de detalle (nombre, direcciones, protocolo) — estado local del componente, sin elevarlo a `DashboardPage` (no hay otro panel que dependa de qué ECU está seleccionada, a diferencia de `selectedDtc`).
- **Sin cambios de backend, dominio ni infraestructura**: no se toca `ObdRepository`, `Elm327TcpRepository`, `ObdSimulatorRepository` ni `isotp-transport`. Ver `design.md` para la justificación explícita de por qué el descubrimiento multi-ECU real vía `isotp-transport` queda fuera de alcance.

## Capabilities

### New Capabilities
- `topology-mapping-screen`: Representación visual (mapa de bus CAN color-coded) de las ECUs devueltas por `GET /api/ecu-info`, como sección adicional del dashboard junto a la tabla existente de `EcuInfoPanel`.

## Impact

- Nuevo: `apps/ui/src/components/dashboard/TopologyMapPanel.tsx`
- Nuevo: `apps/ui/src/components/dashboard/ecuTopologyColors.ts`
- Modificado: `apps/ui/src/components/layout/Sidebar.tsx` (+ sección `topology`)
- Modificado: `apps/ui/src/components/dashboard/DashboardSection.tsx` (+ `case 'topology'`)
- Tests nuevos/modificados en `apps/ui/tests/unit/components/` (`TopologyMapPanel.test.tsx`, `Sidebar.test.tsx`, `ecuTopologyColors.test.ts`) y, si aplica, `apps/ui/tests/e2e/dashboard.spec.ts`
- Sin cambios en `apps/core-api/` (reutiliza `GET /api/ecu-info` y `useEcuInfo` existentes)
