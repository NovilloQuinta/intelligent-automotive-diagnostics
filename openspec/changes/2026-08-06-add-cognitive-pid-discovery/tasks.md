## 1. RED — Dominio: catálogo de PID observations

- [x] 1.1 Crear `tests/unit/domain/pidObservationCatalog.test.ts`:
  - El catálogo contiene entradas para `01 0C`, `01 05`, `01 0D`, `01 0F`, `01 11`, `01 04`, `01 42` con `name`/`unit` definidos
  - `resolvePidObservationStatus(value, def)`: `review` si `value > maxValue` cuando `maxValue` está definido
  - `resolvePidObservationStatus`: `review` si `value < minValue` cuando `minValue` está definido (caso `01 42`, voltaje bajo)
  - `resolvePidObservationStatus`: `ok` en el límite exacto de `maxValue`/`minValue` (boundary, igual que `GAUGE.*` en frontend)
  - `resolvePidObservationStatus`: `ok` siempre si el PID no define `minValue` ni `maxValue` (caso `01 0D`, velocidad)

## 2. GREEN — Implementar catálogo de dominio

- [x] 2.1 Modificar `src/domain/pids.ts`: añadir `PID_ENGINE_LOAD = '04'`, `PID_THROTTLE_POSITION = '11'`, `PID_CONTROL_MODULE_VOLTAGE = '42'` con TSDoc
- [x] 2.2 Crear `src/domain/pidObservationCatalog.ts`:
  - `interface PidObservationDefinition { name: string; unit?: string; minValue?: number; maxValue?: number }`
  - `PID_OBSERVATION_CATALOG: ReadonlyMap<string, PidObservationDefinition>` con las 7 entradas de la tabla de `design.md`
  - `resolvePidObservationStatus(value: number, def: PidObservationDefinition): 'ok' | 'review'`
  - TSDoc en todos los exports públicos

## 3. RED — Escenarios simulados: `pidValues` adicionales

- [ ] 3.1 Añadir/actualizar tests en `tests/unit/infrastructure/simulation/simulator.test.ts`:
  - `readPidValue('01', '11')`, `readPidValue('01', '04')`, `readPidValue('01', '42')` devuelven los valores de `pidValues` para `audi-a3-idle` y `kawa-z900`
  - `getSupportedPids()` incluye las 3 claves nuevas cuando el escenario las define

## 4. GREEN — Extender `seedScenarios.ts`

- [ ] 4.1 Modificar `src/infrastructure/simulation/seedScenarios.ts`: añadir `pidValues` a `audi-a3-idle` y `kawa-z900` con las claves `${MODE_CURRENT_DATA} ${PID_THROTTLE_POSITION}` etc. (importadas de `domain/pids.ts`, sin strings mágicos) y los valores de la tabla de `design.md`

## 5. RED — Aplicación: enriquecimiento de `toolCalls` → `pidObservations`

- [ ] 5.1 Crear `tests/unit/application/services/pidObservationEnricher.test.ts` con casos:
  - `read_pid` con `args {mode:'01', pid:'0C'}` y `result:'850'` conocido en catálogo → `PidObservation` con `status` correcto
  - Tool distinta de `read_pid` (p. ej. `get_dtc_codes`) → ignorada, no genera observación
  - `read_pid` con código fuera de catálogo → ignorada silenciosamente (sin throw)
  - `read_pid` con `result` no numérico (p. ej. mensaje de error `"[client_error] ..."`) → ignorada silenciosamente
  - `args.mode`/`args.pid` en minúsculas o con espacios → normalizados vía `PidCode` antes de buscar en catálogo
  - Dos llamadas al mismo código → se conserva la observación de la última llamada
  - Lista vacía de `toolCalls` → `[]`

## 6. GREEN — Implementar enricher + DTO + cableado en el use case

- [ ] 6.1 Crear `src/application/dto/PidObservation.ts` con TSDoc
- [ ] 6.2 Crear `src/application/services/pidObservationEnricher.ts`: `derivePidObservations(toolCalls: readonly ToolCallTrace[]): PidObservation[]`
- [ ] 6.3 Modificar `src/application/dto/ExecuteCognitiveDiagnosisOutput.ts`: añadir `pidObservations: readonly PidObservation[]`
- [ ] 6.4 Modificar `src/application/use-cases/ExecuteCognitiveDiagnosisUseCase.ts`: tras obtener `{ text, toolCalls }`, llamar a `derivePidObservations(toolCalls)` e incluirlo en el output
- [ ] 6.5 Actualizar `tests/unit/usecases/cognitive/executeCognitiveDiagnosis.test.ts`: el output incluye `pidObservations` derivado de los `toolCalls` mockeados

## 7. RED — Frontend: tipos + `mergePidRows`

- [ ] 7.1 Crear `apps/ui/tests/unit/components/pidCatalog.test.ts`:
  - `mergePidRows(fixedRows, aiRows)` anexa filas IA con códigos que no están en `FIXED_PID_CODES`
  - `mergePidRows` descarta filas IA cuyo código ya está en `FIXED_PID_CODES` (sin duplicar `01 0C`/`01 05`/`01 0D`/`01 0F`)
  - `mergePidRows` deduplica por código entre las propias filas IA (última gana)
  - `mergePidRows(fixedRows, null)` devuelve solo `fixedRows`

## 8. GREEN — Implementar tipos + `mergePidRows`

- [ ] 8.1 Modificar `apps/ui/src/lib/api.ts`: exportar `type PidObservation = { code: string; name: string; unit?: string; value: number; status: "ok" | "review" }`; extender `CognitiveOutput` con `pidObservations: PidObservation[]`
- [ ] 8.2 Modificar `apps/ui/src/components/dashboard/pidCatalog.ts`:
  - Añadir `source: "fixed" | "ai"` a `PidRow` (default `"fixed"` en `buildPidRows`)
  - Exportar `FIXED_PID_CODES: ReadonlySet<string>`
  - Exportar `pidObservationToRow(obs: PidObservation): PidRow` (mapea `unit`/`value` a la cadena `value` ya formateada, `source: "ai"`)
  - Exportar `mergePidRows(fixedRows: PidRow[], aiRows: PidRow[] | null): PidRow[]`

## 9. RED — Frontend: hooks `useCapabilities` + `useCognitiveDiagnosis`

- [ ] 9.1 Crear `apps/ui/tests/unit/components/useCapabilities.test.ts`: llama a `api.getCapabilities()` al montar, expone `{ cognitiveDiagnosis }`, por defecto `false` mientras resuelve
- [ ] 9.2 Crear `apps/ui/tests/unit/components/useCognitiveDiagnosis.test.ts`:
  - `trigger()` llama a `api.getCognitiveDiagnosis(selectedId)`, `loading` pasa a `true` durante la llamada
  - Al resolver, `pidRows` contiene las filas mapeadas de `pidObservations` (`source: "ai"`)
  - Si `api.getCognitiveDiagnosis` lanza, `pidRows` queda `null`/vacío sin propagar el error (no rompe el test ni requiere `toast`)
  - `reset()` limpia `pidRows` y `loading`
  - `trigger()` con `selectedId` vacío no llama a la API

## 10. GREEN — Implementar hooks

- [ ] 10.1 Crear `apps/ui/src/components/dashboard/useCapabilities.ts`
- [ ] 10.2 Crear `apps/ui/src/components/dashboard/useCognitiveDiagnosis.ts`

## 11. RED — Frontend: fusión y estados en `PidsTable`

- [ ] 11.1 Actualizar `apps/ui/tests/unit/components/PidsTable.test.tsx`:
  - Con `aiRows` no nulos y códigos nuevos → se listan tras los 4 fijos, con marca visual de origen IA
  - Con `aiRows` que incluyen un código ya fijo (p. ej. `01 0C`) → no se duplica la fila
  - Con `aiLoading: true` y `aiRows: null` → indicador de carga secundario visible, sin bloquear el resto de la tabla
  - Con `aiLoading: false` y `aiRows: null`/`[]` → sin indicador de carga ni filas IA (caso capacidad no disponible o error silencioso)

## 12. GREEN — Implementar fusión en `PidsTable`

- [ ] 12.1 Modificar `apps/ui/src/components/dashboard/PidsTable.tsx`: props `aiRows: PidRow[] | null`, `aiLoading: boolean`; usar `mergePidRows`; badge/indicador visual para `source === "ai"`; fila de carga discreta mientras `aiLoading`

## 13. RED — Frontend: disparo automático no bloqueante en `DashboardPage`

- [ ] 13.1 Actualizar `apps/ui/tests/unit/components/DashboardPage.test.tsx` (mockeando `useCapabilities`/`useCognitiveDiagnosis` igual que se mockean hoy `useScenarios`/`useDiagnosis`):
  - Tras completar `runDiagnosis()` con `capabilities.cognitiveDiagnosis: true` → se invoca `cognitive.trigger()`
  - Con `capabilities.cognitiveDiagnosis: false` → `cognitive.trigger()` no se invoca
  - `cognitive.trigger()` no bloquea la pintura del resto del dashboard (severidad/DTCs/4 PIDs fijos visibles aunque `cognitive.loading` sea `true`)
  - Al iniciar un nuevo `runDiagnosis()` se invoca `cognitive.reset()` antes de disparar el nuevo `trigger()`

## 14. GREEN — Implementar wiring en `DashboardPage`

- [ ] 14.1 Modificar `apps/ui/src/components/dashboard/DashboardPage.tsx`: integrar `useCapabilities()` + `useCognitiveDiagnosis(selectedId)`; `handleDiagnose` que llama `runDiagnosis()` y, si procede, dispara `cognitive.trigger()` sin `await`; pasar `aiRows`/`aiLoading` a `PidsTable`

## 15. REFACTOR + Verificación

- [ ] 15.1 Ejecutar `pnpm lint && pnpm format && pnpm test && pnpm build` — todo verde
- [ ] 15.2 Revisar Clean Architecture: `domain/pidObservationCatalog.ts` sin imports de capas superiores; `application/services/pidObservationEnricher.ts` sin imports de `infrastructure/`; `ExecuteLlmToolCalling`/`ToolCallTrace` sin cambios
- [ ] 15.3 Revisar DRY/KISS: sin duplicación de umbrales entre el catálogo nuevo y `GAUGE.*` (ámbitos distintos, documentado en Decisión 4 de `design.md`); claves de catálogo construidas vía `PidCode`, no strings mágicos repetidos
- [ ] 15.4 Actualizar `SESION ACTUAL` en `AGENTS.md`
