## Why

Prueba manual de la UI (8 agosto 2026) sobre el dashboard ya mergeado. Cinco defectos reales, todos visibles en la primera pasada de un usuario que no conoce el código:

1. **La identificación del vehículo devuelve datos incorrectos.** El wizard lee el VIN por Mode 09 PID 02 y construye el vehículo *solo* deduciéndolo del VIN (`elm327Adapter.ts:121`): `model` y `engineType` quedan siempre en `'unknown'`, y `make`/`year` dependen de que el WMI decodifique. Pero ni `audi_a3_tdi.py` ni `kawasaki_z900.py` definen respuesta a `09 02`, así que el `try` falla y el `catch` devuelve `FALLBACK_VIN` con todo a `unknown`. El Toyota sí responde, pero con el VIN nativo del emulador — que no es un Toyota. Resultado: el catálogo de escenarios (`composition.ts:130`) sabe la marca, modelo, año y motor de los tres vehículos, y nadie usa ese dato.
2. **Al cambiar de vehículo persisten los datos del anterior.** `useDiagnosis` guarda `result` en estado y nunca lo limpia al cambiar `selectedId` (`useDiagnosis.ts:11`); igual `useCognitiveDiagnosis` con `pidRows`. El `DashboardPage` sí resetea `selectedDtc` (`DashboardPage.tsx:42`) pero se olvidó del resto. Como los gauges sí se actualizan al instante, el usuario ve telemetría de un coche junto a DTCs de otro.
3. **Los DTC salen sin descripción.** El VO `DtcCode` tiene campo `description` y la UI ya lo pinta (`DtcPanel.tsx:86`), pero el adaptador lo construye vacío (`elm327Adapter.ts:103`). No existe catálogo SAE J2012 en el backend: hay `seed-pids.ts` pero no equivalente para DTCs, y el índice vectorial `dtcsIndex` está vacío hasta `add-knowledge-mcp-tools`.
4. **El freeze frame es siempre `0C = 800`.** `getFreezeFrame` pide un único PID hardcodeado (`sendCommand('02 0C')`, `elm327Adapter.ts:85`) y el parámetro `dtc` **no se usa para leer**: solo se pega como etiqueta. Seleccionar P0401 muestra el mismo frame con otro nombre — es engañoso. El escenario del Audi ya define `02 05` y `02 0D` que nadie pide nunca.
5. **La telemetría en vivo es falsa.** `useLiveTelemetry` genera jitter en el navegador sobre las constantes del catálogo (`jitter.ts`), sin tocar el vehículo. Los gauges y la tabla de PIDs muestran magnitudes distintas del mismo coche, que es lo que hace que el conjunto parezca improvisado.

**Restricción temporal que ordena las prioridades**: la semana del 10 de agosto de 2026 se conecta un coche real por ELM327 (`OBD_MODE=tcp`), y hay que poder seguir probando contra el emulador para la memoria del TFM. Los defectos 1, 4 y 5 se manifiestan igual o peor contra hardware real, y el 5 es insostenible con un coche delante. Por eso los cinco entran en este cambio y no se posponen.

## What Changes

### 1. Identidad del vehículo: VIN del ECU + metadatos del catálogo

- Los escenarios del emulador ganan Mode 09 PID 02 con sus VIN reales: `WAUZZZ8V5JA123456` (Audi), `JKAZR2A1XLA000111` (Kawasaki). El Toyota sobreescribe el VIN nativo del emulador con `JTDKN3DU60A123456` en `run_toyota.py`, con el mismo patrón de parcheo del diccionario `ObdMessage` que ya usa `run_audi.py`.
- `DiagnosisService.getVehicleInfo`: cuando el `scenarioId` resuelve a un `ScenarioDescriptor`, fusiona el VIN leído del ECU con `make`/`model`/`year`/`engineType` del catálogo. **El VIN siempre es el del vehículo, nunca el del catálogo**: es el único dato que la centralita conoce de verdad, y sustituirlo por el del descriptor convertiría el wizard en teatro.
- En modo `tcp` no hay descriptor: se mantiene el comportamiento actual (deducción por WMI, `model`/`engineType` a `unknown`). Contra un coche real esa **es** la respuesta correcta — el ECU no expone modelo ni motor por OBD-II estándar.
- El `catch` que devuelve `FALLBACK_VIN` deja de tragarse el fallo en silencio: distingue "VIN ilegible" de "vehículo desconocido" para que el wizard pueda decir cuál de las dos cosas pasó.

### 2. Estado de diagnóstico ligado al vehículo seleccionado

- `useDiagnosis` y `useCognitiveDiagnosis` pasan a TanStack Query con `queryKey: ['diagnosis', selectedId]` / `['cognitive-diagnosis', selectedId]`. Ya está en dependencias (`@tanstack/react-query@5`) y resuelve de una vez invalidación, cancelación de la petición en vuelo y estado de carga, que hoy están hechos a mano con `useState` + un `useRef` de request id.
- Invariante: **ningún panel puede mostrar datos de un `scenarioId` distinto del seleccionado**, ni siquiera durante la transición.

### 3. Catálogo de descripciones DTC

- Nuevo `domain/dtcCatalog.ts` con subconjunto SAE J2012 — mínimo los tres códigos de los escenarios (P0301, P0401, P2002) más los genéricos P0xxx frecuentes. Mismo patrón que `pidFormulaCatalog` resuelve fórmulas: dato estático de dominio, no I/O.
- `readDtcCodes` resuelve la descripción al construir cada `DtcCode`. Un código ausente del catálogo mantiene `description: ''` — **nunca se inventa una descripción**. Ese hueco es exactamente el que luego rellenan el índice vectorial y el LLM en `add-knowledge-mcp-tools`; rellenarlo aquí con texto plausible haría indistinguible el dato verificado del alucinado.

### 4. Freeze frame multi-PID y por DTC

- `getFreezeFrame` lee un conjunto de PIDs Mode 02 (`04`, `05`, `0C`, `0D`, `11`) en vez de solo `02 0C`, degradando por PID: un `NO DATA` en uno no invalida el frame entero.
- El `dtc` recibido se usa para pedir el frame correcto (índice de frame en la trama Mode 02), no solo para etiquetar el resultado.
- Los escenarios del emulador ganan los Mode 02 que faltan y frames distinguibles por DTC en el Audi.

### 5. Telemetría real contra el vehículo

- Se eliminan `useLiveTelemetry` y `jitter.ts`. Los gauges leen del vehículo vía un endpoint nuevo `GET /api/live-data?scenarioId=`, que reutiliza `readPid` para los 4 PIDs del dashboard.
- **Cadencia 1 Hz, no los 2 Hz actuales.** Contra un ELM327 real cada PID cuesta ~50-100 ms y son 4 lecturas secuenciales sobre una única conexión TCP con cola FIFO (`elm327Adapter.ts:36`); a 2 Hz la cola no drena y el polling se solapa consigo mismo. El intervalo va a constante con nombre y TSDoc que explique el porqué.
- Rate limit propio para el endpoint, más permisivo que el de diagnóstico (es 1 petición/s por cliente activo) pero acotado.
- Si una lectura falla, el gauge afectado muestra `—` y el badge `LIVE` cae a "Reconectando…": con hardware real las lecturas fallidas son normales, no excepcionales.

## Lo que NO cambia

- El wizard de identificación y su máquina de estados (`useVehicleAutoDetect`) — sigue igual; lo que cambia es el dato que recibe.
- La regla de severidad (`diagnosisResult.ts:33`) — 0 DTCs → `low`, con freeze frame → `critical`. No se toca.
- El diagnóstico cognitivo, las tools MCP y el stack RAG — este cambio no toca el LLM.
- El catálogo `ScenarioDescriptor.sensorValues` sigue existiendo: deja de alimentar los gauges, pero es la referencia documentada de cada escenario.

## Capabilities

### Added Capabilities
- `vehicle-identification`: identificación del vehículo activo combinando el VIN leído de la centralita con los metadatos del escenario, con comportamiento definido para el modo TCP directo y para VIN ilegible.
- `diagnosis-session-state`: el estado de diagnóstico visible pertenece siempre al vehículo seleccionado.
- `dtc-descriptions`: los códigos DTC se entregan con su descripción SAE J2012 cuando se conoce, y vacía cuando no.
- `freeze-frame-capture`: freeze frame multi-PID asociado al DTC concreto que lo disparó.
- `live-telemetry`: telemetría leída del vehículo real (emulador o coche) con cadencia acotada y degradación por PID.

## Impact

- **Nuevo**: `apps/core-api/src/domain/dtcCatalog.ts`
- **Nuevo**: endpoint `GET /api/live-data` (`diagnosis.routes.ts`, `DiagnosisController.liveData`, `DiagnosisService.getLiveData`)
- **Modificado**: `apps/core-api/src/infrastructure/elm327/elm327Adapter.ts` (`readDtcCodes`, `getFreezeFrame`, `getVehicleInfo`)
- **Modificado**: `apps/core-api/src/infrastructure/services/diagnosisService.ts` (`getVehicleInfo` fusiona descriptor, `getLiveData`)
- **Modificado**: `docker/elm327/scenarios/audi_a3_tdi.py`, `kawasaki_z900.py`, `docker/elm327/run_toyota.py`
- **Modificado**: `apps/ui/src/components/dashboard/useDiagnosis.ts`, `useCognitiveDiagnosis.ts`, `DashboardPage.tsx`
- **Eliminado**: `apps/ui/src/components/dashboard/useLiveTelemetry.ts`, `apps/ui/src/lib/jitter.ts` (y sus tests)
- **Sin cambios**: `useVehicleAutoDetect.ts`, `VehicleAutoDetectWizard.tsx`, `diagnosisResult.ts`, `mcpServer.ts`, stack RAG
