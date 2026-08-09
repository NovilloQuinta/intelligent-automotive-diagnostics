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

- **`apps/ui/src/lib/api.ts` (`getDiagnosisHistory`)** — lee `response.sessions`, pero
  `DiagnosisController.listHistory` responde `{ items, total }`. La lista de historial
  siempre se renderiza vacía.
- **`apps/ui/src/lib/api.ts` (`getDiagnosisHistoryDetail`)** — lee `data.session`, pero
  `DiagnosisController.getHistoryDetail` devuelve el objeto de sesión sin envolver.
  `data.session` es siempre `undefined` → la página de detalle siempre cae en el error.
- **`apps/ui/src/components/dashboard/types.ts`** — `DiagnosisSession`/`DiagnosisSessionDetail`
  declaran `vehicleMake`/`vehicleModel`, pero el controller solo proyecta `vehicleId`. Esos
  campos siempre llegan `undefined` al frontend.

Warnings no bloqueantes también reportados: mensajes de error duplicados sin constante en
`DiagnosisController.ts`, `endSession` con `Record<string, unknown>` en `vehicleRepository.ts`,
`console.error` crudo en `mcpServer.ts` en vez de `LoggerPort`, cálculos repetidos en
`history.$sessionId.tsx` / `useDiagnosisHistoryDetail.ts`, magic number `5` en `HistoryPage.tsx`,
swagger sin documentar los 4 endpoints nuevos de auth/perfil (deuda ya conocida).

---

## Corregidos

<!-- Mover aqui cuando se resuelvan -->

