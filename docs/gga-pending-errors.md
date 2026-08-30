# Errores pendientes GGA

Errores reportados por Gentleman Guardian Angel que se forzaron con `--no-verify`.
Cada entrada debe corregirse en una rama `fix/gga-*` antes del siguiente milestone.

---

## Pendientes

<!-- Formato:
### YYYY-MM-DD — commit <hash>
- **Archivo:linea** — descripcion del error
-->

### 2026-08-30 — cherry-pick e1e0779 (refactor(core): convertir en tablas los switch del parser y el simulador)

GGA con cache dio `STATUS: FAILED` (magic strings `'u'`/`'raw'`/`'<<'`/`'>>'` en pidFormula.ts,
por debajo del umbral DRY de 3+ del proyecto). Sin cache (`gga run --no-cache`), pasada
completa: `STATUS: PASSED`, mismas observaciones mencionadas como no bloqueantes. DeepSeek es
inconsistente entre pasadas para este tipo de hallazgo menor. Arreglado aparte el hallazgo real
y consistente entre ambas pasadas (`encodePercent`/`encodeFuelTrim` dividiendo por `100` sin
nombrar, ahora `PERCENT_BASIS`). Forzado con `--no-verify`, nada mas pendiente.

### 2026-08-30 — fix(elm327): partir processQueue + nombrar magic strings

GGA aprueba de verdad el contenido (confirma explicitamente que el disable razonado de
`processQueue` -complejidad 6, documentado con JSDoc- "esta documentado y es defendible") pero
`STATUS: FAILED` real por una unica violacion, ya conocida y decidida: `createReliableTransport`
(250 lineas, crecio de 236 por los dos helpers extraidos) no cumple la excepcion de 40 lineas
porque es una maquina de estados que ramifica. El usuario decidio explicitamente dejarla
documentada y no partirla ahora (ver `docs/deuda-conocida.md`) porque partirla de verdad exige
separar cola/reconexion/sesion exclusiva en modulos, con riesgo de romper el timing sincrono que
varios tests verifican (ensureConnected y processQueue NO se pueden envolver en otra funcion
`async` intermedia sin anadir un salto de microtask: verificado empiricamente, rompio 41 tests
distintos en dos intentos). El `STATUS:` real cayo fuera de las primeras 30 lineas del output
(bug conocido del hook). Forzado con `--no-verify`, nada pendiente de corregir en el codigo.

### 2026-08-30 — cherry-pick 346c2f8 (test(ui): arreglar la cobertura y meter la UI en el gate)

GGA aprobó de verdad ("Sin observaciones críticas ni menores que exijan corrección") pero
`STRICT_MODE` lo rechazó como ambiguo, mismo bug del hook que las entradas de abajo. Forzado
con `--no-verify` al traer commits de `claude/proyecto-pendientes-nyytej` a `main`, nada
pendiente que corregir.

### 2026-08-29 — fix(gga): magic numbers + STATUS: PASSED fuera de las 30 lineas

GGA aprobó de verdad ("STATUS: PASSED", todos los hallazgos anteriores corregidos) pero
`STRICT_MODE` lo rechazó como ambiguo porque la linea `STATUS:` cayo pasada la linea 30 del
output — mismo bug del hook que las dos entradas del 13/08. Forzado con `--no-verify`, nada
pendiente que corregir.

### 2026-08-09 — merge origin/develop -> pwd-recovery-integration

Preexistente en `origin/develop` (feature `add-diagnosis-history`), no tocado por este merge — GGA
bloquea el commit porque re-audita el repo entero. Documentado aquí en vez de rehacer la feature.

Warnings no bloqueantes también reportados: mensajes de error duplicados sin constante en
`DiagnosisController.ts`, `endSession` con `Record<string, unknown>` en `vehicleRepository.ts`,
`console.error` crudo en `mcpServer.ts` en vez de `LoggerPort`, cálculos repetidos en
`history.$sessionId.tsx` / `useDiagnosisHistoryDetail.ts`, magic number `5` en `HistoryPage.tsx`,
swagger sin documentar los 4 endpoints nuevos de auth/perfil (deuda ya conocida).

### 2026-08-09 — commit eadc28b (fix post-merge)

Preexistente en `origin/develop`, ya registrado como deuda conocida en `AGENTS.md` ("Deuda
`cognitiveDiagnosis` >100 líneas: extraer helpers (GGA bloqueó commit)"). Se eligió esta versión
del fichero en la resolución de conflicto porque incluye `listDiagnosisSessions`/
`getDiagnosisSession` y el snapshot en `endSession`, ausentes en la versión local más antigua.

- **`apps/core-api/src/infrastructure/services/diagnosisService.ts:464-572`** —
  `cognitiveDiagnosis()` ~108 líneas, mezcla persistencia de vehículo + creación de sesión +
  orquestación del diagnóstico. Requiere extraer `upsertVehicle`/`createSession`/`endSession`
  a métodos privados.

Warnings no bloqueantes: doc-comments huérfanos en `api.ts:248-249`, `severityMeta` recalculado
varias veces en `SessionReportPanel.tsx`, paginación de `HistoryPage.tsx` no centra el rango en
la página activa (`Math.min(totalPages, 5)`).

### 2026-08-13 — commit secciones 6-7 `add-ecu-discovery-and-system-catalog`

GGA `STRICT_MODE` falla con "ambiguous response" (la línea `STATUS:` no va en las primeras 30
líneas del output del proveedor) — bug del hook, no del código. Build/lint/test/format/security
en verde. Violaciones de estilo reportadas:

- **`apps/core-api/src/infrastructure/mcp/mcpServer.ts:786-900`** — `registerKnowledgeTools`
  115 líneas (>40, declarativa). Preexistente; agravada por +2 tools (`search_similar_ecus`/
  `index_ecu`). Requiere disable `max-lines-per-function` razonado o registro data-driven.
- **`apps/core-api/src/infrastructure/mcp/mcpServer.ts:502-545`** — `registerDiagnosticTools`
  44 líneas (declarativa). Preexistente.
- **`apps/core-api/src/infrastructure/mcp/mcpServer.ts:327-328`** — `persistDtcs`: magic
  `confidence: 0.5` y `source: 'auto'` sin constantes nombradas. Preexistente.
- **`apps/core-api/src/infrastructure/mcp/mcpServer.ts:211-212`** — `persistPidReading`:
  fallbacks `?? 2` (dataBytes) y `rawHex = '00'` sin constantes nombradas. Introducido en
  este cambio (sección 6).

### 2026-08-13 — commit a69937b (cabecera navegación autenticada + asterisco email)

GGA `STRICT_MODE` falla con "ambiguous response" (mismo bug del hook que la entrada anterior).
Tests UI (577), `tsc`, `eslint`, `prettier` y `build` en verde. Violaciones reportadas, todas
**preexistentes** (no introducidas por este cambio):

- **`apps/ui/src/components/layout/Header.tsx:47`** — `boxShadow` con `rgba(255,107,53,0.6)`
  hardcodeado (duplica el primary `#FF6B35`). Preexistente (venía del header inline de la landing).
- **Error-box DRY** — bloque `rounded-md border border-destructive/30 bg-destructive/10 px-4
  py-3 text-sm text-destructive` repetido 14× (history.$sessionId, login, profile, HistoryPage,
  reset-password, DiagnosisChat, SessionReportPanel, DashboardPage, VehicleAutoDetectWizard).
  Extraer un `<Alert>`/`<FormError>` compartido.
- **Code smell >40 líneas sin disable** — `HistoryPage.tsx:68-284`, `login.tsx` RegisterForm
  (~115), `profile.tsx` ProfileDataForm/ChangePasswordForm. Preexistentes.
- **DRY `onChange` fechas** — `HistoryPage.tsx:128-132 / 144-148` duplican `slice(0,10)` +
  `toISOString()` + `setPage(1)`. Extraer `handleDateChange`.
- Menores: magic `5` (filas skeleton) en `HistoryPage.tsx:209`; "Registrarse" enlaza a `/login`
  (no a la pestaña register).

---

## Corregidos

<!-- Mover aqui cuando se resuelvan -->

### 2026-08-29 — fix(gga): createServer, execute, assertOk, trigger y magic numbers

- **`server.ts`** — `createServer` (57 líneas) partido en `mountProfileRoutes`/
  `mountTwoFactorProfileRoutes`; `HSTS maxAge` (31536000) y status 500 nombrados
  (`HSTS_MAX_AGE_SECONDS`, `HTTP_INTERNAL_SERVER_ERROR`).
- **`ExecuteCognitiveDiagnosisUseCase.ts`** — `execute` (51 líneas) partido en
  `offTopicOutput`/`executeValuation`; `60` nombrado `MAX_SHOUT_LENGTH`.
- **`apiClient.ts`** — ternario de 4 niveles en `assertOk` extraído a `extractErrorMessage`;
  401/500/429 nombrados (`HTTP_UNAUTHORIZED`/`HTTP_SERVER_ERROR_MIN`/`HTTP_TOO_MANY_REQUESTS`).
- **`useCognitiveDiagnosis.ts`** — ternario de 4 niveles en `deriveCognitiveDiagnosisError`
  sustituido por tabla `STATUS_TO_KIND`; `trigger` (63 líneas) partido en
  `buildSuccessState`/`emptyState`.

Sin cambio de comportamiento, verificado con `pnpm verify` en verde.

### 2026-08-13 — fix/gga-pending-errors

- **`apps/core-api/src/infrastructure/http/controllers/DiagnosisController.ts`** — extraído
  helper `runDiagnosisHandler` que dedupe el patrón `safeParse`→400→`try/call`→`respond`→catch de
  los 8 handlers de lectura/escritura (`freezeFrame`, `ecuInfo`, `vehicleInfo`, `liveData`,
  `clearDtc`, `pendingDtc`, `permanentDtc`, `vehicleStatus`). Sin cambio de comportamiento
  (69 tests de `diagnosis.routes.test.ts` en verde).
- **Contrato de historial** — alineado frontend al backend: `api.getDiagnosisHistory` lee `items`
  (no `sessions`), `api.getDiagnosisHistoryDetail` devuelve el objeto plano (no `{ session }`),
  `DiagnosisSession` usa `vehicleId`/`scenarioId`/`endedAt` (se eliminaron `vehicleMake`/
  `vehicleModel`), `resultJson` nullable, `HistoryPage` muestra `scenarioId` y
  `history.$sessionId` deriva la identidad del vehículo del snapshot `resultJson`.

