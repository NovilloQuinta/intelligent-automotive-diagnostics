## Context

`ObdRepository.readVin()` y `getVehicleInfo()` ya existen y están implementados por ambos adaptadores (`ObdSimulatorRepository`, `Elm327TcpRepository`). En modo TCP directo, `Elm327TcpRepository.getVehicleInfo()` ya intenta decodificar el VIN leído para derivar `make`/`year` vía los getters de `Vin` (`manufacturer`, `modelYear`), con fallback a `'unknown'`/`0` si el VIN no es legible. En modo simulación, `getVehicleInfo()` simplemente devuelve el `vehicleInfo` estático del escenario (`ObdSimulator.getVehicleInfo()`). Ninguno de los dos casos se expone hoy como endpoint estructurado — solo se usa internamente en `ProcessVehicleDiagnosisUseCase` y como tools MCP de texto narrativo (`read_vin`, `get_vehicle_info`).

`useScenarios` (frontend) selecciona automáticamente el primer escenario en cuanto `GET /api/scenarios` responde, sin ningún paso de identificación intermedio — el usuario entra directo al dashboard de telemetría. Esto es adecuado para desarrollo rápido pero no refleja el flujo "Vehicle Menu → Auto Detect → Diagnóstico" de una herramienta profesional como Autel.

## Goals / Non-Goals

**Goals:**
- Endpoint `GET /api/vehicle-info?scenarioId=` que exponga VIN + datos del vehículo de forma estructurada, reutilizando `readVin()`/`getVehicleInfo()` sin duplicar lógica de decodificación (los getters de `Vin` ya existen).
- Wizard de 3 pasos que gatee la entrada al menú de diagnóstico existente, sin reescribir `TelemetrySection`/`DtcPanel`/`DiagnosisPanel` (se montan igual que hoy, solo que después de la confirmación).
- Mantener la capacidad de cambiar de vehículo/escenario en caliente (para la demo multi-escenario), mediante `VehicleSelector` reabriendo el wizard.

**Non-Goals:**
- No se implementa descubrimiento automático de múltiples vehículos candidatos ni escaneo de bus para elegir cuál identificar — el usuario sigue eligiendo el `scenarioId`/conexión antes de que el wizard lea su VIN. "Auto Detect" aquí significa "identificación automática del vehículo ya seleccionado", no "descubrimiento de qué vehículos hay disponibles" (eso ya lo cubre `GET /api/scenarios`).
- No se cachea ni persiste el vehículo identificado entre sesiones (`VehicleRepository`/`upsertVehicle` sigue sin conectarse — mismo criterio que `add-ecu-info-screen`).
- No se valida el checksum del VIN (`Vin.isCheckDigitValid()`) como bloqueo de flujo — se muestra como dato informativo si se decide incluirlo en el paso de confirmación, pero un checksum inválido no impide continuar (los VIN de escenarios de demo no necesariamente pasan el checksum SAE, y un ELM327 real con ruido en el bus no debería bloquear el diagnóstico).

## Decisions

### 1. Endpoint `GET /api/vehicle-info`, mismo patrón que `add-ecu-info-screen`/`add-freeze-frame-screen`

**Elegido**: `GET /api/vehicle-info?scenarioId=` → `DiagnosisService.getVehicleInfo(scenarioId)` → `repository.getVehicleInfo()` (y opcionalmente `repository.readVin()` si se quiere mostrar el VIN crudo antes de la decodificación como paso visual separado). Consistente con los otros 3 cambios: endpoint REST estructurado dedicado, sin pasar por la tool MCP de texto.

**Rechazado**: Añadir `vehicleInfo` al payload de `GET /api/scenarios`. Ya está ahí en modo simulación (`Scenario.vehicleInfo`), pero en modo TCP directo el escenario placeholder (`TCP_DIRECT_SCENARIO`) tiene datos falsos (`make: 'unknown'`) — el wizard necesita forzar una lectura en vivo, no el valor estático del placeholder.

### 2. El wizard no reemplaza `VehicleSelector`, lo envuelve

**Elegido**: `VehicleAutoDetectWizard` se muestra antes de que `selectedId` tenga valor (gate inicial). Una vez dentro del menú de diagnóstico, `VehicleSelector` (dropdown existente en `TopBar`) permite cambiar de escenario; al hacerlo, reabre el wizard (no vuelve a montar directamente `TelemetrySection` con el nuevo escenario) para mantener la coherencia de "todo cambio de vehículo pasa por identificación".

**Rechazado**: Eliminar `VehicleSelector` y solo permitir cambiar de vehículo cerrando/reabriendo toda la sesión. Rompería la fluidez de demo (comparar varios escenarios sin recargar la página) que ya ofrece el dropdown actual.

### 3. Wizard como máquina de estados local en `DashboardPage`, no como ruta separada

**Elegido**: `useVehicleAutoDetect` mantiene un estado `'selecting' | 'detecting' | 'confirming' | 'done'` dentro del árbol de `DashboardPage`. Cuando el estado es `'done'`, se renderiza el layout actual (`TelemetrySection`/`DtcPanel`/`DiagnosisPanel`); en los demás estados se renderiza el wizard a pantalla completa.

**Rechazado**: Ruta TanStack Start separada (`/vehicle-select`) con `navigate()` al confirmar. Añadiría complejidad de enrutamiento y estado compartido entre rutas para un flujo que es conceptualmente parte de una única sesión de dashboard; el patrón de estado local ya se usa para `loading`/`result` en `useDiagnosis`.

### 4. Paso "Detectando vehículo": llamada real, no animación simulada con `setTimeout`

**Elegido**: El paso `'detecting'` dispara la llamada real a `GET /api/vehicle-info` y muestra un spinner/scanning UI mientras la promesa está pendiente — sin retraso artificial. En modo simulación la respuesta es casi instantánea (el escenario ya tiene los datos), lo cual es correcto: no hay necesidad de fingir latencia para la demo.

**Rechazado**: `setTimeout` artificial para simular "escaneo" tipo Autel. Introduce falsedad en el sistema y complica los tests (temporizadores falsos) sin aportar valor: el spinner ya comunica progreso; si se quiere una sensación más "cinematográfica" es una decisión puramente visual de `writer`, no de arquitectura.

## Data Model

```typescript
// GET /api/vehicle-info?scenarioId=audi-a3-idle → 200
interface VehicleInfoResponse {
  vin: string
  make: string
  model: string
  year: number
  engineType: string
  // Derivados del VO Vin (null si el VIN no es decodificable, p.ej. FALLBACK_VIN)
  manufacturer: string | null
  region: { country: string; region: string } | null
  modelYearDecoded: number | null
}
```

### Flujo de ejecución

```
Usuario abre el dashboard (sin vehículo seleccionado)
  → VehicleAutoDetectWizard, estado 'selecting'
      → GET /api/scenarios (ya existente) → lista de escenarios/conexión TCP
  → Usuario elige un escenario → estado 'detecting'
      → GET /api/vehicle-info?scenarioId=<id>
          → resolveRepository(scenarioId)
          → repository.readVin() + repository.getVehicleInfo()
          → 200 { vin, make, model, year, engineType, manufacturer, region, modelYearDecoded }
  → estado 'confirming': muestra tarjeta de vehículo identificado
  → Usuario confirma → estado 'done', selectedId = <id>
      → se monta TelemetrySection/DtcPanel/DiagnosisPanel (sin cambios respecto al flujo actual)
```

## UI

`VehicleAutoDetectWizard` reutiliza los iconos/estilo ya presentes (`Car`/`Bike` de `VehicleSelector`, paleta `COLORS`/`GRADIENTS` de `types.ts`) para mantener coherencia visual. Pantalla completa (reemplaza el `<main>` del dashboard mientras no esté `'done'`), no un modal — refuerza la sensación de "paso obligatorio" antes de diagnosticar, igual que el Vehicle Menu de Autel ocupa toda la pantalla del escáner.
