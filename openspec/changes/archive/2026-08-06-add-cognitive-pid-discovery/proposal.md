## Why

El dashboard ya muestra un panel "PIDs Leídos" (`PidsTable.tsx` + `pidCatalog.ts`) con los 4 PIDs fijos que devuelve `POST /api/diagnosis` (`01 0C`, `01 05`, `01 0D`, `01 0F`), con veredicto OK/Revisar calculado en el cliente. En paralelo, el backend ya tiene un flujo completo de **diagnóstico cognitivo LLM** (`ExecuteCognitiveDiagnosisUseCase`, MCP Server con 6 tools, endpoint `POST /api/mcp/cognitive-diagnosis`) capaz de leer PIDs arbitrarios vía la tool `read_pid` durante su razonamiento — pero ese flujo **no está conectado a ninguna pantalla**: `apps/ui/src/lib/api.ts` ya define `api.getCognitiveDiagnosis()` y `api.getCapabilities()`, pero ningún componente los invoca.

Cada llamada a `read_pid` queda registrada en `ToolCallTrace` (`{ tool, args, result }`) con `result` como string plano sin metadata — el mecánico no puede saber si "850" es una lectura sana o alarmante sin nombre, unidad ni rango. Añadir esa metadata reutilizando el `VehicleRepository`/`seed-pids.ts` real forzaría un acoplamiento artificial: ese catálogo está indexado por `vehicleId` numérico y pensado para el adaptador ELM327 hardware, mientras que el dashboard y el simulador (`ObdSimulator`) operan sobre `scenarioId` de texto (`audi-a3-idle`, `kawa-z900`) sin relación con ese `vehicleId`. Además, `createMcpServer` se construye hoy sin `vehicleRepo` en el endpoint cognitivo, por lo que la tool `get_available_pids` ya está inerte en este flujo.

Esta propuesta documenta cómo cerrar ese hueco: un catálogo de metadata de PIDs propio y ligero para el flujo cognitivo/simulado, y la integración en el dashboard para que el panel "PIDs Leídos" fusione los 4 PIDs fijos con los PIDs adicionales que la IA descubra, disparado automáticamente tras pulsar "Iniciar diagnóstico" (confirmado con el usuario), sin bloquear el resto de la pantalla.

## What Changes

- **Nuevo catálogo de dominio `PidObservationCatalog`** (`domain/`): mapa PID código → `{ name, unit?, minValue?, maxValue? }`, cubriendo los 4 PIDs ya usados (`01 0C`, `01 05`, `01 0D`, `01 0F`) más 3 adicionales reales — posición del acelerador (`01 11`), carga calculada del motor (`01 04`) y voltaje del módulo de control (`01 42`) — para que la IA tenga algo que descubrir más allá de los 4 fijos. Desacoplado de la entidad `PidDefinition`/`seed-pids.ts` (pensada para bytes crudos + persistencia SQLite, no para valores físicos ya resueltos del simulador).
- **`seedScenarios.ts` ampliado**: ambos escenarios (`audi-a3-idle`, `kawa-z900`) añaden un `pidValues` con lecturas simuladas para los 3 PIDs nuevos, reutilizando el mecanismo `SimulationScenario.pidValues` que ya soporta `ObdSimulator.readPidValue`.
- **Nuevo servicio de enriquecimiento en `application/`**: deriva `PidObservation[]` (código, nombre, unidad, valor, veredicto ok/review) a partir de las llamadas `read_pid` resueltas en `ToolCallTrace[]`, cruzando con el catálogo. Vive **fuera** del bucle genérico `ExecuteLlmToolCalling` (reutilizado por cualquier flujo de tool-calling, no solo el cognitivo) y se invoca únicamente desde `ExecuteCognitiveDiagnosisUseCase`, que expone el resultado en un nuevo campo `pidObservations` de `ExecuteCognitiveDiagnosisOutput` — sin tocar `ToolCallTrace` (DTO genérico) ni el bucle de tool-calling.
- **Frontend**: primera conexión real de `api.getCognitiveDiagnosis()`/`api.getCapabilities()`. Disparo automático tras "Iniciar diagnóstico" (no un botón separado, confirmado por el usuario), no bloqueante, gateado por `getCapabilities().cognitiveDiagnosis`. `PidsTable` fusiona los 4 PIDs fijos con los `pidObservations` de origen IA sin duplicar códigos, marcando visualmente las filas de origen IA y mostrando un indicador de carga secundario mientras la respuesta cognitiva (hasta 60 s) está en curso.

## Capabilities

### New Capabilities
- `cognitive-pid-discovery`: catálogo de metadata de PIDs para el flujo cognitivo/simulado, enriquecimiento backend de las lecturas `read_pid` con nombre/unidad/veredicto, e integración en el dashboard que fusiona esas lecturas con el panel "PIDs Leídos" existente.

### Modified Capabilities
- `execute-cognitive-diagnosis`: `ExecuteCognitiveDiagnosisOutput` incorpora un nuevo campo `pidObservations: readonly PidObservation[]` derivado de las llamadas `read_pid` de la sesión, sin cambiar el contrato de `ToolCallTrace` ni del bucle de tool-calling genérico.

## Impact

- Nuevo: `apps/core-api/src/domain/pidObservationCatalog.ts` (catálogo + `resolvePidObservationStatus`)
- Modificado: `apps/core-api/src/domain/pids.ts` (+`PID_ENGINE_LOAD`, `PID_THROTTLE_POSITION`, `PID_CONTROL_MODULE_VOLTAGE`)
- Modificado: `apps/core-api/src/infrastructure/simulation/seedScenarios.ts` (+`pidValues` en ambos escenarios)
- Nuevo: `apps/core-api/src/application/dto/PidObservation.ts`
- Nuevo: `apps/core-api/src/application/services/pidObservationEnricher.ts`
- Modificado: `apps/core-api/src/application/dto/ExecuteCognitiveDiagnosisOutput.ts` (+`pidObservations`)
- Modificado: `apps/core-api/src/application/use-cases/ExecuteCognitiveDiagnosisUseCase.ts` (delega en el enricher)
- Nuevo: `apps/core-api/tests/unit/domain/pidObservationCatalog.test.ts`
- Nuevo: `apps/core-api/tests/unit/application/services/pidObservationEnricher.test.ts`
- Modificado: `apps/core-api/tests/unit/usecases/cognitive/executeCognitiveDiagnosis.test.ts`
- Modificado: `apps/core-api/tests/unit/infrastructure/simulation/simulator.test.ts` (si cubre `pidValues` de escenarios semilla)
- Modificado: `apps/ui/src/lib/api.ts` (+tipo `PidObservation`, `CognitiveOutput.pidObservations`)
- Modificado: `apps/ui/src/components/dashboard/pidCatalog.ts` (+`source` en `PidRow`, `FIXED_PID_CODES`, `mergePidRows`)
- Nuevo: `apps/ui/src/components/dashboard/useCapabilities.ts`
- Nuevo: `apps/ui/src/components/dashboard/useCognitiveDiagnosis.ts`
- Modificado: `apps/ui/src/components/dashboard/PidsTable.tsx` (fusión + badge IA + indicador de carga secundario)
- Modificado: `apps/ui/src/components/dashboard/DashboardPage.tsx` (dispara `cognitive.trigger()` tras `runDiagnosis()`, no bloqueante)
- Nuevo: `apps/ui/tests/unit/components/pidCatalog.test.ts`, `useCapabilities.test.ts`, `useCognitiveDiagnosis.test.ts`
- Modificado: `apps/ui/tests/unit/components/PidsTable.test.tsx`, `DashboardPage.test.tsx`
- Sin cambios: `VehicleRepository`, `SqliteVehicleRepository`, `seed-pids.ts` (real, indexado por `vehicleId`) — quedan para el adaptador ELM327 hardware
