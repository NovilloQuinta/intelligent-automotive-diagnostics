## 0. Preparación

- [ ] 0.1 Crear `fix/vehicle-identity-and-live-data` desde `develop`
- [ ] 0.2 Verificar baseline: `pnpm lint && pnpm format && pnpm test && pnpm build` en verde; anotar nº de tests de core-api y de UI
- [ ] 0.3 Cargar contexto: este `proposal.md`/`design.md`, `elm327Adapter.ts`, `diagnosisService.ts`, `composition.ts:130` (catálogo), `docker/elm327/scenarios/*.py`, `useDiagnosis.ts`, `useLiveTelemetry.ts`, `jitter.ts`
- [ ] 0.4 Levantar los tres emuladores (`docker compose up -d`) y confirmar con `pnpm obd:send "09 02"` qué responde hoy cada uno — es el punto de partida del defecto 1

## 1. Emulador: Mode 09 PID 02 (VIN) en los tres escenarios

- [ ] 1.1 Añadir entrada `VIN` (`^0902`) a `docker/elm327/scenarios/audi_a3_tdi.py` con `WAUZZZ8V5JA123456`
- [ ] 1.2 Añadir entrada `VIN` (`^0902`) a `docker/elm327/scenarios/kawasaki_z900.py` con `JKAZR2A1XLA000111`
- [ ] 1.3 Parchear el VIN del escenario nativo `car` en `run_toyota.py` con `JTDKN3DU60A123456`, mismo patrón de parcheo de `ObdMessage` que usa `run_audi.py`
- [ ] 1.4 `docker compose build && docker compose up -d`; verificar los tres con `pnpm obd:send "09 02"` — los tres VIN correctos, respuesta multi-frame bien formada
- [ ] 1.5 Anotar en el reporte la forma exacta de la respuesta multi-frame del emulador, para contrastarla luego con la del coche real (riesgo del `design.md`)

## 2. Backend: identidad del vehículo compuesta

- [ ] 2.1 RED: test — `DiagnosisService.getVehicleInfo('audi-a3-tdi')` devuelve `model: 'A3'` y `engineType: '2.0 TDI'` del descriptor, y el `vin` leído del repositorio (mockeado), no el del descriptor
- [ ] 2.2 GREEN: `resolveDescriptor(scenarioId)` en `DiagnosisService` y fusión en `getVehicleInfo`
- [ ] 2.3 RED: test — en modo TCP directo (sin descriptores) `getVehicleInfo()` mantiene el comportamiento actual: `make` deducido del WMI, `model`/`engineType` a `'unknown'`
- [ ] 2.4 GREEN: rama sin descriptor
- [ ] 2.5 RED: test — el VIN leído del ECU nunca se sustituye por el del descriptor, ni siquiera cuando difieren
- [ ] 2.6 RED: test — `vinStatus` vale `'read'` con VIN válido, `'unsupported'` cuando el ECU responde `NO DATA` a `09 02`, y `'unreadable'` cuando responde algo que no parsea
- [ ] 2.7 GREEN: distinguir los tres casos en `elm327Adapter.getVehicleInfo` y propagar `vinStatus` en `VehicleInfoOutput`
- [ ] 2.8 UI: mostrar el mensaje correspondiente a cada `vinStatus` en `ConfirmingStep`/`DetectingStep` (sustituye al genérico "VIN no decodificable")
- [ ] 2.9 REFACTOR: con la suite en verde — revisar que `decodeVin` no duplique la lógica de `vinStatus`; TSDoc de por qué el VIN nunca viene del catálogo

## 3. Backend: catálogo de descripciones DTC

- [x] 3.1 RED: test — `dtcCatalog.describe('P0301')` devuelve la descripción SAE J2012
- [x] 3.2 GREEN: crear `domain/dtcCatalog.ts` con P0301, P0401, P2002 + genéricos P0xxx frecuentes
- [x] 3.3 RED: test — un código ausente del catálogo devuelve `''`, no una descripción derivada de la familia del código
- [x] 3.4 GREEN: implementar el fallback vacío
- [x] 3.5 RED: test — `readDtcCodes` devuelve los `DtcCode` con `description` resuelta
- [x] 3.6 GREEN: resolver la descripción en `elm327Adapter.readDtcCodes`
- [x] 3.7 Verificación manual: diagnóstico del Audi en la UI — P0301, P0401 y P2002 con descripción visible
- [x] 3.8 REFACTOR: con la suite en verde — comprobar que el catálogo no importa nada de `infrastructure/` (regla de capas) y que `DtcCode.toString()` sigue coherente

## 4. Backend: freeze frame multi-PID y por DTC

- [ ] 4.1 Ampliar el escenario del Audi con los Mode 02 que faltan (`02 04`, `02 11`) y frames distinguibles por DTC
- [ ] 4.2 RED: test — `getFreezeFrame` devuelve un frame con los 5 PIDs cuando el vehículo responde a todos
- [ ] 4.3 GREEN: leer el conjunto de PIDs Mode 02 en vez de solo `02 0C`
- [ ] 4.4 RED: test — un PID que responde `NO DATA` se omite del frame y los demás se conservan
- [ ] 4.5 GREEN: `try` por PID
- [ ] 4.6 RED: test — si ningún PID responde, `getFreezeFrame` devuelve `null`
- [ ] 4.7 RED: test — pedir el frame de P0401 devuelve valores distintos que el de P0301 (deja de ser una etiqueta)
- [ ] 4.8 GREEN: usar el `dtc` para seleccionar el frame en la trama Mode 02
- [ ] 4.9 Verificación manual: en la UI, clicar P0301 y P0401 muestra frames distintos
- [ ] 4.10 REFACTOR: con la suite en verde — la lista de PIDs del freeze frame a constante con nombre; TSDoc del criterio de degradación

## 5. Backend: endpoint de telemetría en vivo

- [ ] 5.1 RED: test — `DiagnosisService.getLiveData(scenarioId)` devuelve los 4 PIDs del dashboard reutilizando `readPid`
- [ ] 5.2 GREEN: implementar `getLiveData`
- [ ] 5.3 RED: test — `GET /api/live-data` sin `scenarioId` en modo docker responde 400; con escenario inexistente, 404
- [ ] 5.4 GREEN: `DiagnosisController.liveData` + ruta, siguiendo el patrón de `ecuInfo`/`freezeFrame` (schema Zod required/optional según `isDirectConnection`)
- [ ] 5.5 RED: test — un PID que falla no tumba la respuesta: ese campo llega a `null` y el resto con valor
- [ ] 5.6 GREEN: degradación por PID
- [ ] 5.7 Rate limit propio para `/api/live-data`, coherente con 1 petición/s por cliente
- [ ] 5.8 REFACTOR: con la suite en verde — verificar que no se duplica la lista de PIDs entre `ProcessVehicleDiagnosisUseCase` y `getLiveData` (DRY: extraer a `domain/pids.ts` si hace falta)

## 6. UI: estado de diagnóstico ligado al vehículo

- [x] 6.1 RED: test — con un resultado de diagnóstico en pantalla, cambiar de `selectedId` deja los paneles DTC, PIDs y diagnóstico en estado vacío
- [x] 6.2 GREEN: migrar `useDiagnosis` a `useMutation` + caché bajo `queryKey: ['diagnosis', selectedId]`
- [x] 6.3 RED: test — lo mismo para las filas AI de `useCognitiveDiagnosis`
- [x] 6.4 GREEN: migrar `useCognitiveDiagnosis` a `queryKey: ['cognitive-diagnosis', selectedId]`
- [x] 6.5 RED: test — una petición en vuelo al cambiar de vehículo no escribe su resultado en el vehículo nuevo
- [x] 6.6 GREEN: verificar que la cancelación de Query cubre el caso (el `useRef` de request id manual debe poder eliminarse)
- [x] 6.7 Verificación manual: diagnosticar el Audi, cambiar a Kawasaki, confirmar que no queda ni un DTC del Audi en pantalla
- [x] 6.8 REFACTOR: con la suite en verde — comprobar que no queda estado de diagnóstico en `useState` fuera de Query

## 7. UI: gauges contra el vehículo real

- [ ] 7.1 RED: test — el hook de telemetría llama a `/api/live-data` con el `scenarioId` seleccionado y expone los 4 valores
- [ ] 7.2 GREEN: nuevo hook con `refetchInterval` = constante `LIVE_TELEMETRY_INTERVAL_MS` (1000) y su TSDoc explicando el coste por PID del ELM327 real
- [ ] 7.3 RED: test — un PID a `null` pinta `—` en su gauge sin romper los demás
- [ ] 7.4 RED: test — si la lectura falla, el badge pasa de `LIVE` a "Reconectando…"
- [ ] 7.5 GREEN: estados de degradación en `TelemetrySection`
- [ ] 7.6 Eliminar `useLiveTelemetry.ts`, `lib/jitter.ts` y sus tests
- [ ] 7.7 Verificación manual: los gauges y la tabla de PIDs muestran los mismos valores para el mismo vehículo
- [ ] 7.8 REFACTOR: con la suite en verde — confirmar con `grep` que no queda ninguna referencia a `jitter` en `apps/ui/`

## 8. Verificación contra el emulador (los tres vehículos)

- [ ] 8.1 Audi: VIN `WAUZZZ8V5JA123456`, A3 2.0 TDI 2018; P0301/P0401/P2002 con descripción; severidad `critical`; freeze frames distintos por DTC; gauges = 800 rpm / 90 °C / 0 km/h / 35 °C
- [ ] 8.2 Kawasaki: VIN `JKAZR2A1XLA000111`, Z900 2020; sin DTCs; severidad `low`; gauges = 1300 rpm / 95 °C / 0 km/h / 28 °C
- [ ] 8.3 Toyota: VIN `JTDKN3DU60A123456`, Auris Hybrid 2016; sin DTCs; severidad `low`; anotar los valores reales del escenario nativo `car`
- [ ] 8.4 Cambio de vehículo entre los tres sin residuos de datos del anterior
- [ ] 8.5 Anotar todos los resultados en el reporte — es material directo para la memoria del TFM

## 9. Verificación contra el coche real (`OBD_MODE=tcp`)

- [ ] 9.1 Test previo: `parseVinResponse` contra una trama multi-frame real capturada (riesgo del `design.md`); si no hay captura disponible, hacerla en la sesión y añadir el test después
- [ ] 9.2 Conectar el ELM327 al vehículo, `OBD_MODE=tcp`, sin cambiar código
- [ ] 9.3 Wizard: VIN real leído y decodificado; `model`/`engineType` a `unknown` es el resultado correcto en este modo
- [ ] 9.4 Diagnóstico: DTCs reales (si los hay) con descripción del catálogo o vacía; anotar los códigos fuera de catálogo — justifican el bloque RAG siguiente
- [ ] 9.5 Telemetría: medir la latencia real por ciclo de 4 PIDs y decidir si 1 Hz aguanta o hay que subir el intervalo; dejar el dato en el reporte
- [ ] 9.6 Anotar qué PIDs Mode 02 soporta el vehículo real frente al emulador

## 10. Cierre

- [ ] 10.1 Revisión transversal (NO sustituye a los REFACTOR de cada fase): `@reviewer` sobre el diff completo; `@security` sobre el endpoint nuevo `/api/live-data` (auth, rate limit, validación Zod)
- [ ] 10.2 `pnpm lint && pnpm format && pnpm test && pnpm build` — los cuatro en verde, también `pnpm test:ui`
- [ ] 10.3 `gga run` en verde (comprobar el STATUS real del reporte, no solo el exit code del hook)
- [ ] 10.4 Actualizar `SESION ACTUAL` en `AGENTS.md`
- [ ] 10.5 Guardar en Engram las decisiones no obvias: composición de identidad del vehículo, 1 Hz y su porqué, descripción DTC vacía como invariante
- [ ] 10.6 **Preguntar antes de commitear/pushear** (regla 7) — mostrar resumen y esperar OK humano
