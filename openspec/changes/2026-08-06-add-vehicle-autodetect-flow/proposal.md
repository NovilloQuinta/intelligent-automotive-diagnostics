## Why

Autel MaxiSys abre cada sesión con un "Vehicle Menu" que identifica el vehículo (VIN, marca/modelo/año) antes de dar acceso al menú de diagnóstico. Nuestro dashboard hoy hace lo contrario: `useScenarios` selecciona automáticamente el primer escenario devuelto por `GET /api/scenarios` en cuanto llega la respuesta (`if (data.length && !selectedId) setSelectedId(data[0].id)`), y `VehicleSelector` es un dropdown que permite cambiar de vehículo sin ningún paso de identificación — el usuario nunca ve un VIN leerse ni decodificarse.

El dominio ya tiene todo lo necesario para modelar ese paso: `ObdRepository.readVin()` y `ObdRepository.getVehicleInfo()` (ya usados por `ProcessVehicleDiagnosisUseCase` y expuestos como tools MCP `read_vin`/`get_vehicle_info`), y el VO `Vin` con getters ricos (`manufacturer`, `wmiRegion`, `modelYear`, `isCheckDigitValid()`) que hoy no se usan en ningún flujo — son capacidades de dominio completamente implementadas y sin consumidor. El valor real de este cambio es especialmente visible en modo TCP directo: hoy el "escenario" placeholder (`TCP_DIRECT_SCENARIO`) muestra `make: 'unknown'`/`model: 'unknown'` en vez de leer el VIN real del vehículo conectado.

## What Changes

- **Nuevo endpoint `GET /api/vehicle-info?scenarioId=`** en `DiagnosisController`/`diagnosis.routes.ts`: llama a `repository.readVin()` + `repository.getVehicleInfo()` y devuelve VIN + datos del vehículo, decorados con los getters del VO `Vin` (`manufacturer`, `region`, `modelYear`) cuando el VIN es válido. Reutiliza el patrón de endpoint estructurado ya establecido en `add-ecu-info-screen`/`add-freeze-frame-screen` (delega en el repositorio directamente, no en la tool MCP narrativa).
- **Nuevo componente `VehicleAutoDetectWizard`** (`apps/ui/src/components/dashboard/VehicleAutoDetectWizard.tsx`) + hook `useVehicleAutoDetect`: wizard de 3 pasos — (1) elegir escenario/conexión, (2) "Detectando vehículo…" (llama a `GET /api/vehicle-info`), (3) confirmación con VIN decodificado y datos del vehículo, con botón "Entrar a diagnóstico".
- **`useScenarios` deja de auto-seleccionar** el primer escenario; `DashboardPage` no monta `TelemetrySection`/`DtcPanel`/`DiagnosisPanel` hasta que el wizard confirma un vehículo (`selectedId` solo se fija tras la confirmación).
- **`VehicleSelector` se conserva** como forma de cambiar de vehículo *después* de estar en el menú de diagnóstico (reabre el wizard en vez de cambiar de escenario directamente), preservando la flexibilidad de demo multi-escenario.

## Capabilities

### New Capabilities
- `vehicle-autodetect-flow`: Flujo de identificación de vehículo (lectura y decodificación de VIN) como paso obligatorio antes de acceder al menú de diagnóstico, sustituyendo la selección automática/instantánea actual.

## Impact

- Modificado: `apps/core-api/src/infrastructure/services/diagnosisService.ts` (+`getVehicleInfo(scenarioId)`)
- Modificado: `apps/core-api/src/infrastructure/http/controllers/DiagnosisController.ts`, `routes/diagnosis.routes.ts` (+`GET /api/vehicle-info`)
- Modificado: `apps/core-api/src/infrastructure/http/swagger.ts`
- Nuevo: `apps/ui/src/components/dashboard/VehicleAutoDetectWizard.tsx`, `useVehicleAutoDetect.ts`
- Modificado: `apps/ui/src/components/dashboard/useScenarios.ts` (elimina auto-selección)
- Modificado: `apps/ui/src/components/dashboard/DashboardPage.tsx` (gate de entrada al menú de diagnóstico)
- Modificado: `apps/ui/src/components/dashboard/VehicleSelector.tsx` (reabre el wizard)
- Modificado: `apps/ui/src/components/dashboard/types.ts`, `apps/ui/src/lib/api.ts` (+`getVehicleInfo()`)
- Tests unitarios correspondientes en `apps/core-api/tests/unit/` y `apps/ui/tests/unit/`, y actualización de `apps/ui/tests/e2e/dashboard.spec.ts`
