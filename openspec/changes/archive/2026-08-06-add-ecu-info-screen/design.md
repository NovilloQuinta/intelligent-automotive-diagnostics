## Context

Stack: TypeScript ESM strict, Express 5, Clean Architecture, React 19 + TanStack Start, Vitest. El flujo de diagnóstico actual (`DiagnosisService` → `ObdRepository`) es 100% dirigido por `scenarioId` (o modo TCP directo sin escenario). `VehicleInfo`, `DtcCode` y `FreezeFrame` viajan por este camino: método en `ObdRepository` → implementación en `ObdSimulatorRepository`/`Elm327TcpRepository` → tool MCP (para el LLM) → uso en `ProcessVehicleDiagnosisUseCase`/`ExecuteCognitiveDiagnosisUseCase`.

`EcuInfo` existe como entidad de dominio (`domain/entities/ecuInfo.ts`) pero solo se usa en `VehicleRepository`/`SqliteVehicleRepository`, un catálogo auto-expansivo indexado por VIN pensado para persistir el histórico de vehículos vistos. Este puerto **nunca se instancia** en `infrastructure/composition/composition.ts` — no hay `SqliteVehicleRepository` en ningún flujo activo. Conectarlo directamente a la pantalla de ECU forzaría a la UI a manejar `vehicleId` persistido (no `scenarioId`), un concepto que no existe hoy en el dashboard, y dejaría el diagnóstico cognitivo sin acceso a los datos de ECU (el LLM solo ve lo que expone `ObdRepository` vía MCP).

## Goals / Non-Goals

**Goals:**
- Exponer datos de ECU por el mismo camino que el resto de datos "en vivo" del vehículo activo (`scenarioId` → `ObdRepository`), consistente con `VehicleInfo`/`FreezeFrame`.
- Tool MCP `get_ecu_info` para que el diagnóstico cognitivo pueda citar la ECU implicada en un DTC.
- Endpoint REST estructurado (no el texto narrativo de la tool MCP) para que la UI renderice una tabla.
- Datos de demo reales en los 2 escenarios semilla existentes.

**Non-Goals:**
- No se implementa descubrimiento real de ECUs vía UDS (Service 0x22 broadcast / direcciones funcionales ISO 15765-4). El adaptador `Elm327TcpRepository` no direcciona múltiples ECUs (una única conexión TCP, sin routing CAN por ECU); `getEcuInfo()` en TCP devuelve una ECU sintética fija. Descubrimiento real de bus es un cambio de infraestructura mayor (fuera de alcance de una pantalla de UI) y podría apoyarse en `isotp-transport` (ya implementado pero no integrado) en un cambio futuro.
- No se conecta `VehicleRepository`/`SqliteVehicleRepository` a este flujo. Sigue existiendo como catálogo persistente independiente; una futura propuesta puede decidir si el catálogo se sincroniza desde `ObdRepository.getEcuInfo()` (p.ej. al iniciar una `DiagnosisSession`), pero no es parte de este cambio.
- No se añade edición ni borrado de ECUs desde la UI — solo lectura.

## Decisions

### 1. `getEcuInfo()` en `ObdRepository`, no reutilizar `VehicleRepository`

**Elegido**: Nuevo método `getEcuInfo(): Promise<EcuInfo[]>` en el puerto `ObdRepository`, junto a `getVehicleInfo()`/`getFreezeFrame()`. Reutiliza el mismo `EcuInfo` de dominio (sin cambios en la entidad), pero como dato "leído del vehículo activo" en vez de "persistido en catálogo".

**Rechazado**: Instanciar `SqliteVehicleRepository` en la composición e implementar el endpoint sobre `findEcusByVehicle(vehicleId)`. Requeriría resolver `vehicleId` desde `scenarioId` (no existe esa relación hoy: los escenarios no se persisten como `VehicleProfile`), y dejaría el diagnóstico cognitivo sin acceso a las ECUs (el LLM solo usa tools MCP sobre `ObdRepository`).

### 2. Escenario simulado: campo `ecus?: EcuInfo[]`, `id: 0` sintético

**Elegido**: `SimulationScenario.ecus?: EcuInfo[]`, con `id: 0` y `vehicleId: 0` (no hay persistencia real en modo simulación, igual que `FreezeFrame` no lleva `id`). `ObdSimulator.getEcus()` devuelve `this.scenario.ecus ?? []`; si el escenario no define `ecus`, se devuelve `[]` en vez de lanzar error (a diferencia de `readPidValue`, que sí puede lanzar — ECU info es metadata opcional, no una lectura crítica).

**Rechazado**: Lanzar error si el escenario no tiene ECUs definidas. Rompería escenarios legacy sin necesidad; la UI debe manejar el caso "sin ECUs descubiertas" con un estado vacío, igual que `DtcPanel` maneja "0 DTCs".

### 3. TCP directo: una ECU sintética fija (motor, `7E0`/`7E8`)

**Elegido**: `Elm327TcpRepository.getEcuInfo()` devuelve `[new EcuInfo({ id: 0, vehicleId: 0, name: 'Engine Control Unit', requestAddr: '7E0', responseAddr: '7E8', type: 'ECM', protocol: 'ISO 15765-4 (CAN 11/500)' })]` — las direcciones estándar OBD-II Mode 01 que ya usa el resto del adaptador. Documenta explícitamente (TSDoc) que es una aproximación: el adaptador no hace descubrimiento multi-ECU.

**Rechazado**: Devolver `[]` en TCP directo. La pantalla quedaría vacía en el único modo "real" del sistema, perdiendo valor de demo; una ECU sintética con las direcciones reales que ya usa el resto del código es más honesta que un vacío y no inventa datos que el sistema no usa en otro sitio.

### 4. Endpoint REST dedicado, no el genérico `/mcp/tools/:toolName`

**Elegido**: `GET /api/ecu-info?scenarioId=` con handler propio en `DiagnosisController.ecuInfo`, delegando en `DiagnosisService.getEcuInfo(scenarioId)` → `repository.getEcuInfo()` directamente (sin pasar por `createMcpServer`/`callTool`, que devuelve texto narrativo pensado para el LLM, no JSON estructurado).

**Rechazado**: Reutilizar `POST /api/mcp/tools/get_ecu_info` desde la UI. El resultado de una tool MCP es `{ content: [{ type: 'text', text: '...' }] }` — una cadena para el LLM, no una lista tipada de objetos `EcuInfo`. Forzar a la UI a parsear ese texto sería frágil.

### 5. Query param `scenarioId` (GET), no body — consistente con `GET /api/scenarios`

**Elegido**: `GET /api/ecu-info?scenarioId=<id>`, con el mismo `scenarioIdField(required)` de Zod usado en `DiagnosisBodySchema` pero validando `req.query`. En modo TCP directo, `scenarioId` es opcional (igual que en el resto de endpoints).

**Rechazado**: `POST /api/ecu-info` con `scenarioId` en el body. Es una operación de lectura idempotente (como `GET /api/scenarios`); usar `GET` es más correcto semánticamente y evita el `express.json()` body-parsing innecesario para una consulta simple.

## Data Model

```typescript
// GET /api/ecu-info?scenarioId=audi-a3-idle → 200
interface EcuInfoResponse {
  ecus: {
    id: number
    vehicleId: number
    name: string
    requestAddr: string
    responseAddr: string
    type: string
    protocol: string
    discoveredAt?: string
  }[]
}
```

### Flujo de ejecución

```
GET /api/ecu-info?scenarioId=audi-a3-idle
  → resolveRepository(scenarioId)   // simulador o TCP (patrón existente)
  → repository.getEcuInfo()
  → 200 { ecus: EcuInfo[] }

Tool MCP get_ecu_info (sin argumentos)
  → repository.getEcuInfo()
  → texto: "ECU: Engine Control Unit (7E0→7E8) — ISO 15765-4"
```

## UI

`EcuInfoPanel` se integra en `DashboardPage` como una tercera tarjeta en la columna derecha (junto a `DtcPanel`/`DiagnosisPanel`), o como pestaña/acordeón si el layout de 2 filas ya está lleno — decisión de implementación libre para `writer`, siguiendo el patrón visual existente (`panel` CSS class, iconografía `lucide-react`, animación `fade-up`). Estados: vacío (sin vehículo seleccionado), cargando, lista de ECUs en tabla compacta (nombre, tipo, addr request → addr response, protocolo). Se carga automáticamente al cambiar `selectedId` (mismo trigger que `useLiveTelemetry`), no requiere pulsar "Diagnosticar".
