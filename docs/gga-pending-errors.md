# Errores pendientes GGA

Errores reportados por Gentleman Guardian Angel que se forzaron con `--no-verify`.
Cada entrada debe corregirse en una rama `fix/gga-*` antes del siguiente milestone.

---

## Pendientes

<!-- Formato:
### YYYY-MM-DD — commit <hash>
- **Archivo:linea** — descripcion del error
-->

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

---

## Corregidos

<!-- Mover aqui cuando se resuelvan -->

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

