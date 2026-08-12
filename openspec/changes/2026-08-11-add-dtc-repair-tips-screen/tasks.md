## 1. RED — `GetDtcRepairTipsUseCase`: búsqueda combinada, degradación por índice

- [ ] 1.1 Crear `apps/core-api/tests/unit/application/use-cases/GetDtcRepairTipsUseCase.test.ts`:
  - Ambos índices devuelven resultados → combinados, `source` correcto (`'dtc'`/`'diagnosis'`), ordenados por `distance` ascendente
  - `dtcsIndex.search()` rechaza, `diagnosisIndex.search()` resuelve → devuelve solo los de `diagnosisIndex`, sin lanzar, `logger.warn` invocado
  - `diagnosisIndex.search()` rechaza, `dtcsIndex.search()` resuelve → simétrico al caso anterior
  - Ambos índices devuelven `[]` → devuelve `[]`
  - Texto de búsqueda con `description` → `"<code>: <description>"` pasado a ambos `.search()`
  - Texto de búsqueda sin `description` → solo `"<code>"` pasado a ambos `.search()`
  - `manufacturer`/`model` presentes → `filter: { manufacturer, model }` pasado a ambos `.search()`
  - `manufacturer`/`model` ausentes (o `'unknown'`) → `filter` ausente/`undefined` en ambos `.search()`
  - `limit` respetado en ambas llamadas (`options.limit`)
  - Resultado de `source: 'dtc'` incluye `validated`; resultado de `source: 'diagnosis'` incluye `symptoms`

## 2. GREEN — Implementar `GetDtcRepairTipsUseCase`

- [ ] 2.1 Crear `apps/core-api/src/application/dto/knowledge/DtcRepairTip.ts` con la interfaz `DtcRepairTip` (`source`, `distance`, `embeddedText`, `manufacturer`, `model`, `confidence`, `validated?`, `symptoms?`)
- [ ] 2.2 Crear `apps/core-api/src/application/use-cases/GetDtcRepairTipsUseCase.ts`: constructor recibe `{ dtcsIndex: DtcVectorRepository, diagnosisIndex: DiagnosisVectorRepository, logger: LoggerPort }`; `execute({ code, description, manufacturer, model, limit })` construye el texto de búsqueda, ejecuta ambas búsquedas con `Promise.allSettled`, mapea cada resultado cumplido a `DtcRepairTip` con su `source`, registra `logger.warn` en cada rechazo sin propagar, combina y ordena por `distance`

## 3. REFACTOR — Bloque 1

- [ ] 3.1 Extraer la construcción del texto de búsqueda (`"<code>: <description>"`) a una función pura nombrada, con test directo si no quedó ya cubierta por 1.1 — evitar duplicar esta lógica si `DiagnosisService`/el controlador también la tocan
- [ ] 3.2 Revisar que `GetDtcRepairTipsUseCase` no importe nada de `infrastructure/` (regla Clean Architecture `application/` → nunca `infrastructure/`)
- [ ] 3.3 `pnpm --filter core-api test GetDtcRepairTipsUseCase` en verde antes de continuar

## 4. RED — `DiagnosisService.getDtcRepairTips` + getter `hasKnowledgeBase`

- [ ] 4.1 Extender `apps/core-api/tests/unit/infrastructure/services/diagnosisService.test.ts` (o crear el fichero si no existe cobertura previa del área):
  - `scenarioId` inexistente → `getDtcRepairTips()` rechaza con `DiagnosisScenarioNotFoundError`, igual que `getFreezeFrame`/`getEcuInfo`
  - Vehículo identificado (`make !== 'unknown'`) → `GetDtcRepairTipsUseCase.execute()` recibe `manufacturer`/`model` resueltos de `getVehicleInfo()`
  - Vehículo no identificado (`make === 'unknown'`, modo TCP/serial directo) → `GetDtcRepairTipsUseCase.execute()` recibe `manufacturer`/`model` ausentes
  - `knowledgeStack` no configurado (`undefined`) → `getDtcRepairTips()` devuelve `[]` sin lanzar, sin invocar ningún índice
  - `hasKnowledgeBase` → `true` cuando `knowledgeStack` está presente, `false` cuando no

## 5. GREEN — Implementar `getDtcRepairTips` + `hasKnowledgeBase` en `DiagnosisService`

- [ ] 5.1 Añadir getter `hasKnowledgeBase: boolean` a `DiagnosisService` (`this.knowledgeStack !== undefined`), mismo patrón que `hasCognitiveDiagnosis`
- [ ] 5.2 Añadir método `getDtcRepairTips(scenarioId, code, description, limit)`: resuelve `getVehicleInfo(scenarioId)` (reutilizado, valida escenario), instancia/usa `GetDtcRepairTipsUseCase` con `knowledgeStack?.dtcsIndex`/`knowledgeStack?.diagnosisIndex` cuando `knowledgeStack` está presente, devuelve `[]` inmediatamente si no lo está (sin instanciar el caso de uso)
- [ ] 5.3 Pasar `manufacturer`/`model` al caso de uso solo si `make !== 'unknown'`

## 6. REFACTOR — Bloque 2

- [ ] 6.1 Revisar si `GetDtcRepairTipsUseCase` debe construirse una vez en el constructor de `DiagnosisService` (como el resto de dependencias) o por llamada — seguir el patrón ya usado para `ExecuteCognitiveDiagnosisUseCase` en este mismo fichero
- [ ] 6.2 Confirmar que no hay duplicación entre la resolución de `manufacturer`/`model === 'unknown'` aquí y en `ExecuteCognitiveDiagnosisUseCase`/`toDiagnosisEntry` — extraer una constante/función compartida (`UNKNOWN_VALUE`) si aporta claridad sin acoplar módulos que no deban conocerse
- [ ] 6.3 `pnpm --filter core-api test diagnosisService` en verde antes de continuar

## 7. RED — `DiagnosisController.dtcRepairTips` + `capabilities` extendido

- [ ] 7.1 Extender `apps/core-api/tests/unit/infrastructure/http/controllers/DiagnosisController.test.ts`:
  - `GET /api/dtc-repair-tips` sin `code` → `400` con detalle de validación
  - `GET /api/dtc-repair-tips` con `scenarioId` inexistente → `404` `Scenario not found`
  - `GET /api/dtc-repair-tips` válido → `200` con `{ tips: DtcRepairTip[] }`
  - `GET /api/mcp/capabilities` → incluye `knowledgeBase` reflejando `service.hasKnowledgeBase`

## 8. GREEN — Implementar el controlador y la ruta

- [ ] 8.1 Añadir `DtcRepairTipsQuerySchema`/`DtcRepairTipsQueryTcpSchema` (vía `scenarioSchemas`) con `code: z.string().min(1)`, `description: z.string().optional()`, `limit` opcional acotado
- [ ] 8.2 Añadir método `dtcRepairTips` en `DiagnosisController`, mismo patrón que `freezeFrame`/`ecuInfo` (`selectSchema` + `safeParse` + `respondIfCommonError` + `respondUnexpected`)
- [ ] 8.3 Extender `capabilities` para incluir `knowledgeBase: this.service.hasKnowledgeBase`
- [ ] 8.4 Añadir `router.get('/dtc-repair-tips', controller.dtcRepairTips)` en `diagnosis.routes.ts`
- [ ] 8.5 Añadir `/api/dtc-repair-tips` a `applyDiagnosisRateLimits` en `server.ts` (mismo `diagnosisLimiter` que `/api/freeze-frame`/`/api/ecu-info`)

## 9. REFACTOR — Bloque 3

- [ ] 9.1 Revisar mensajes de error (`ERROR_MESSAGES`) — reutilizar `invalidBody`/`scenarioNotFound` existentes, no duplicar strings
- [ ] 9.2 `pnpm --filter core-api test DiagnosisController` en verde antes de continuar
- [ ] 9.3 `pnpm --filter core-api lint && pnpm --filter core-api build` en verde antes de continuar

## 10. RED — `DtcPanel.onSelect` propaga `description`

- [ ] 10.1 Extender `apps/ui/tests/unit/components/DtcPanel.test.tsx`: click en un código con `description` → `onSelect` invocado con `(code, description)`; comportamiento de selección visual (`selected`/`aria-selected`) sin cambios

## 11. GREEN — Ensanchar `DtcPanel`

- [ ] 11.1 Modificar `apps/ui/src/components/dashboard/DtcPanel.tsx`: prop `onSelect: (code: string, description?: string) => void`; `CodeList`'s `onClick` pasa `c.description`

## 12. REFACTOR — Bloque 4

- [ ] 12.1 Confirmar que `FreezeFramePanel`/`DashboardPage` (consumidores actuales de `selectedDtc`) no requieren ningún cambio de tipo por este ensanchamiento — si el compilador exige alguno, es señal de que el cambio no es tan aditivo como se documentó en `design.md` y hay que revisar la Decisión 5
- [ ] 12.2 `pnpm --filter ui test DtcPanel` en verde antes de continuar

## 13. RED — `useDtcRepairTips` + `DtcRepairTipsPanel`

- [ ] 13.1 Crear `apps/ui/tests/unit/components/useDtcRepairTips.test.ts` (o `.tsx` si usa `renderHook` con providers): llama a `api.getDtcRepairTips(scenarioId, code, description)`, `enabled` solo cuando `scenarioId` y `code` presentes
- [ ] 13.2 Crear `apps/ui/tests/unit/components/DtcRepairTipsPanel.test.tsx`:
  - Sin `selectedDtc` → estado vacío "Selecciona un código DTC..."
  - `knowledgeBase: false` → estado informativo de no disponibilidad, sin disparar la query (`api.getDtcRepairTips` no invocado)
  - `loading: true` → `PanelState state="loading"`
  - `error` presente → `PanelState state="error"`
  - `tips: []` → estado vacío "Sin resultados..." (distinto texto al de "no disponible")
  - `tips` con un elemento `source: 'dtc'` → tarjeta con etiqueta "Significado del código"
  - `tips` con un elemento `source: 'diagnosis'` → tarjeta con etiqueta "Caso resuelto previo"

## 14. GREEN — Implementar `useDtcRepairTips` + `DtcRepairTipsPanel`

- [ ] 14.1 Añadir `DtcRepairTip` a `apps/ui/src/components/dashboard/types.ts` (misma forma que el DTO del backend)
- [ ] 14.2 Añadir `api.getDtcRepairTips(scenarioId, code, description?, limit?)` en `apps/ui/src/lib/api.ts` (`GET /api/dtc-repair-tips`)
- [ ] 14.3 Extender `api.getCapabilities()`/`useCapabilities()` con `knowledgeBase: boolean`
- [ ] 14.4 Crear `apps/ui/src/components/dashboard/useDtcRepairTips.ts` (mismo patrón que `useFreezeFrame.ts`)
- [ ] 14.5 Crear `apps/ui/src/components/dashboard/DtcRepairTipsPanel.tsx`: `panel` CSS class, icono `Wrench`, `PanelState` para los cinco estados (sin selección / no disponible / cargando / error / sin resultados), tarjetas con badge de `source`, `fade-up` con `animationDelay` escalonado

## 15. REFACTOR — Bloque 5

- [ ] 15.1 Revisar duplicación de mensajes de estado vacío/error con `FreezeFramePanel`/`EcuInfoPanel` — extraer si son literalmente el mismo string
- [ ] 15.2 Extraer constantes de badge/color por `source` si se repiten inline en el JSX
- [ ] 15.3 `pnpm --filter ui test DtcRepairTipsPanel useDtcRepairTips` en verde antes de continuar

## 16. RED — Integración en `Sidebar` + `DashboardSection` + `DashboardPage`

- [ ] 16.1 Añadir en `apps/ui/tests/unit/components/Sidebar.test.tsx`: item "Tips Reparación" visible, `onChange` invocado con `'repair-tips'` al hacer click
- [ ] 16.2 Extender el test de `DashboardSection` (o crear `DashboardSection.test.tsx` si no existe): `activeSection: 'repair-tips'` renderiza `DtcRepairTipsPanel` con `dtc`/`description`/`knowledgeBase` correctos
- [ ] 16.3 Extender el test de `DashboardPage` (si existe): seleccionar un DTC guarda `selectedDtc` y `selectedDtcDescription`; la navegación a `freeze-frame` tras seleccionar sigue intacta (regresión explícita de la Decisión 5)

## 17. GREEN — Implementar la integración

- [ ] 17.1 Modificar `apps/ui/src/components/layout/Sidebar.tsx`: añadir `'repair-tips'` a `SidebarSection`, entrada en `SECTIONS` con icono `Wrench` y etiqueta "Tips Reparación"
- [ ] 17.2 Modificar `apps/ui/src/components/dashboard/DashboardSection.tsx`: `case 'repair-tips': return <DtcRepairTipsPanel scenarioId={selectedId} dtc={selectedDtc} description={selectedDtcDescription} knowledgeBase={knowledgeBase} />` (nombres de props exactos a decidir por `ui` siguiendo la forma ya usada por `FreezeFramePanel`)
- [ ] 17.3 Modificar `apps/ui/src/components/dashboard/DashboardPage.tsx`: nuevo estado `selectedDtcDescription`, `handleDtcSelect(code, description)` guarda ambos y mantiene la navegación a `'freeze-frame'` sin cambios; pasar `knowledgeBase` desde `useCapabilities()` a `DashboardSection`

## 18. REFACTOR — Bloque 6

- [ ] 18.1 Confirmar que `DiagnosisState`/`CognitiveState` (o la sub-interfaz de props que corresponda en `DashboardSection.tsx`) no crecen de forma desordenada — agrupar `selectedDtc`/`selectedDtcDescription`/`knowledgeBase` en la sub-interfaz más cohesiva, no añadir props sueltas al nivel plano si ya existe agrupación por dominio
- [ ] 18.2 `pnpm --filter ui test Sidebar DashboardSection DashboardPage` en verde antes de continuar

## 19. Verificación final

- [ ] 19.1 Ejecutar `pnpm lint && pnpm format && pnpm test && pnpm build` — todo verde
- [ ] 19.2 `pnpm test:coverage` — confirmar que los ficheros nuevos (`GetDtcRepairTipsUseCase.ts`, `DtcRepairTipsPanel.tsx`, `useDtcRepairTips.ts`) cumplen el umbral Features ≥80%, y que `GetDtcRepairTipsUseCase.ts` (Core, `application/use-cases/`) apunta a 100% si el proyecto lo exige para esa carpeta — confirmar contra `coverage-strategy`
- [ ] 19.3 (Opcional, si el flujo lo justifica) Añadir un caso en `apps/ui/tests/e2e/dashboard.spec.ts` que seleccione un DTC, navegue a "Tips Reparación" y verifique que se renderiza al menos un estado válido (vacío o con resultados) sin excepción en consola
- [ ] 19.4 Revisar que ningún fichero nuevo de `application/`/`domain/` importe de `infrastructure/` (regla Clean Architecture)
- [ ] 19.5 Actualizar `SESION ACTUAL` en `AGENTS.md`
