## 0. Preparación

- [x] 0.1 Crear `feat/live-data-pid-selector` desde `develop`
- [x] 0.2 Verificar baseline: `pnpm lint && pnpm format && pnpm test && pnpm build` en verde
- [ ] 0.3 Cargar contexto: `protocol.ts` (parseModeResponse, parseVinResponse), `elm327Adapter.ts` (readPid), `diagnosisService.ts` (getLiveData), `ObdRepository.ts`, `useLiveTelemetry.ts`, `TelemetrySection.tsx`, `PidsTable.tsx`

## 1. Backend: parseModeResponse multi-frame

- [x] 1.1 RED: test — `parseModeResponse("0: 41 0C 0C 80\n1: 41 0D 5A\n>")` devuelve `[0x0C, 0x80, 0x5A]`
- [x] 1.2 RED: test — multi-PID response `"0: 41 0C 0C 80\r\n1: 41 0D 5A\r\n2: 41 05 50\r\n>"` devuelve `[0x0C, 0x80, 0x5A, 0x50]`
- [x] 1.3 RED: test — single-line response sigue funcionando: `"41 0C 0C 80>"` devuelve `[0x0C, 0x80]`
- [x] 1.4 RED: test — response con `NO DATA` en una línea: `"0: 41 0C 0C 80\n1: NO DATA\n>"` lanza `Elm327NoDataError`
- [x] 1.5 GREEN: implementar multi-frame en `parseModeResponse` siguiendo patrón de `parseVinResponse`
- [x] 1.6 REFACTOR: extraer helper `parseMultiLineResponse(raw, linePrefix)` compartido por parseModeResponse y parseVinResponse

## 2. Backend: readPids en repositorio

- [x] 2.1 RED: test — `ObdRepository.readPids('01', ['0C', '0D'])` envía `01 0C 0D` y devuelve `Map { '0C' => 750, '0D' => 90 }`
- [x] 2.2 GREEN: añadir `readPids` al puerto `ObdRepository`
- [x] 2.3 GREEN: implementar `elm327Adapter.readPids(mode, pids)`: un solo sendCommand + parseModeResponse
- [x] 2.4 RED: test — PID que responde `NO DATA` se omite del Map, los demás ok
- [x] 2.5 GREEN: degradación por PID en readPids
- [x] 2.6 REFACTOR: suite en verde

## 3. Backend: getLiveData con PIDs dinámicos

- [x] 3.1 RED: test — `DiagnosisService.getLiveData(scenarioId, ['0C', '0D'])` usa `readPids` en vez de 4 `readPid`
- [x] 3.2 GREEN: modificar `getLiveData` para aceptar array opcional de PIDs
- [x] 3.3 RED: test — sin array usa los 4 PIDs por defecto (compatibilidad hacia atrás)
- [x] 3.4 GREEN: comportamiento default
- [x] 3.5 REFACTOR: constante `DEFAULT_LIVE_PIDS` con nombre

## 4. Backend: endpoint con query param

- [x] 4.1 RED: test — `GET /api/live-data?scenarioId=audi&pids=0C,0D` devuelve 200 con solo esos 2 campos
- [x] 4.2 RED: test — `GET /api/live-data?scenarioId=audi` (sin pids) devuelve los 4 campos actuales
- [x] 4.3 RED: test — `pids=ZZ,XX` (PIDs inválidos) → 400
- [x] 4.4 RED: test — `pids=A,B,0C,D,E,F,G,H,I,J` (más de 8) → 400
- [x] 4.5 GREEN: modificar `LiveDataQuerySchema` Zod para aceptar pids opcional
- [x] 4.6 GREEN: modificar `DiagnosisController.liveData` handler
- [x] 4.7 GREEN: validación contra `ALL_SEED_PIDS` (solo PIDs Mode 01)
- [x] 4.8 Actualizar swagger.ts
- [x] 4.9 REFACTOR: suite en verde

## 4b. Backend: respuesta genérica `readings` + simulador 16 PIDs

- [x] 4b.1 RED: test — `getLiveData(scenarioId, ['11','42'])` devuelve `readings` con `{code,name,unit,value}` para esos PIDs
- [x] 4b.2 RED: test — `getLiveData` sin pids devuelve los 4 campos nombrados + `readings` de los 4 default
- [x] 4b.3 GREEN: `getLiveData` enriquece name/unit desde `ALL_SEED_PIDS` y devuelve array `readings`
- [x] 4b.4 RED: test — simulador devuelve valor para los 16 PIDs Mode 01 (no solo 7)
- [x] 4b.5 GREEN: extender `seedScenarios`/`readPidValue` con datos plausibles para los 16 Mode 01
- [x] 4b.6 REFACTOR: suite en verde + swagger `readings`

## 5. UI: selector de PIDs en PidsTable

- [x] 5.1 RED: test — `PidsTable` muestra checkboxes cuando `selectable: true`
- [x] 5.2 RED: test — checkboxes solo para PIDs Mode 01 (no Mode 22 propietarios)
- [x] 5.3 RED: test — máximo 8 seleccionables, el 9º se ignora con tooltip
- [x] 5.4 RED: test — `onPidsChange` callback emite array de PIDs seleccionados
- [x] 5.5 GREEN: implementar checkboxes en `PidsTable`
- [x] 5.6 REFACTOR: extraer `PidCheckbox` si el markup se repite (no aplica — markup en un único sitio vía `map`)

## 6. UI: TelemetrySection dinámico

- [x] 6.1 RED: test — `TelemetrySection` con `pids: ['0C', '0D']` renderiza 2 gauges, no 4
- [x] 6.2 RED: test — sin `pids` renderiza los 4 por defecto
- [x] 6.3 RED: test — PID con valor `null` muestra `—`
- [x] 6.4 GREEN: modificar `TelemetrySection` para aceptar `pids` opcional y renderizar dinámico
- [x] 6.5 RED: test — `useLiveTelemetry(selectedId, ['0C', '0D'])` llama a `/api/live-data?pids=0C,0D`
- [x] 6.6 GREEN: modificar `useLiveTelemetry` para aceptar array de PIDs
- [x] 6.7 REFACTOR: suite en verde
- [x] 6.8 RED: test — `TelemetrySection` con PID sin gauge dedicado (ej. `'11'`) renderiza gauge genérico (nombre+valor+unidad) desde `readings`
- [x] 6.9 GREEN: componente de gauge genérico + mapeo de `readings` a gauges (4 dedicados + resto genérico)

## 7. UI: integración en DashboardPage

- [x] 7.1 RED: test — `DashboardPage` propaga `selectedPids` state desde PidsTable a TelemetrySection
- [x] 7.2 GREEN: wiring en `DashboardPage`
- [x] 7.3 REFACTOR: suite en verde

## 8. Verificación manual

- [ ] 8.1 Con emulador docker: `GET /api/live-data?scenarioId=audi-a3-tdi&pids=0C,0D,05` devuelve solo esos 3 campos
- [ ] 8.2 Con emulador docker: sin `pids` devuelve los 4 de siempre
- [ ] 8.3 UI: checkboxes visibles en PidsTable, seleccionar cambia los gauges
- [ ] 8.4 UI: cambiar de vehículo resetea selección a los 4 por defecto
- [ ] 8.5 Anotar resultados — material para memoria TFM

## 9. Cierre

- [ ] 9.1 `@reviewer` sobre el diff completo
- [ ] 9.2 `pnpm lint && pnpm format && pnpm test && pnpm build` en verde
- [ ] 9.3 Actualizar `SESION ACTUAL` en `AGENTS.md`
- [ ] 9.4 **Preguntar antes de commitear/pushear** (regla 7)
