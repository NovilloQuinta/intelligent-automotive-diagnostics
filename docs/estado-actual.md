# Estado actual

> Lo mantiene la regla 8 de `AGENTS.md`. Maximo 15 lineas, **solo estado presente**.
> El historial va a git, a `openspec/changes/archive/` y a Engram — nunca aqui.
>
> Vive fuera de `AGENTS.md` a proposito: es la parte que cambia en cada tarea, y
> tenerla mezclada con las reglas obligaba a recargar el fichero entero en cada agente.

- **Fase**: 4 — Diagnostico Cognitivo LLM / Refactor Arquitectura + deploy a produccion
- **Ultimo paso**: `fix/gga-pending-errors` mergeado a `develop` (commit `af3bcaa`). Resuelve la deuda que GGA destapó: (1) DRY en `DiagnosisController` — helper `runDiagnosisHandler` dedupe los 8 handlers (sin cambio de comportamiento, 69 tests rutas en verde); (2) bug de contrato del historial — `api.getDiagnosisHistory` lee `items` (no `sessions`), `getDiagnosisHistoryDetail` devuelve plano (no `{session}`), `DiagnosisSession` alineado al backend (`vehicleId`/`scenarioId`/`endedAt`, `resultJson` nullable), `HistoryPage` muestra `scenarioId`, `history.$sessionId` deriva el vehículo del snapshot. Entradas movidas a `Corregidos` en `docs/gga-pending-errors.md`. Antes: `fix/live-data-pid-selector` (5fbdc91) — readPids secuencial + `GET /api/available-pids` + selector de 16 PIDs + e2e docker 12/12.
- **Flujo de ramas**: `develop` es la rama de integración; toda `feat.*`/`fix.*` sale de `develop` y se mergea ahí. `main` = releases (deploy CI). **Ojo**: hay agentes paralelos en el repo principal (rama cambia sola) — verificar `git branch --show-current` antes de commitear.
- **Rama base**: `develop` (no == `main`; deploy via `main`).
- **Worktrees activos** en `.claude/worktrees/`: `add-ecu-discovery-and-system-catalog` (`feat/add-ecu-discovery-and-system-catalog`), `deployment` (`feat/deployment`, obsoleto).
- **OpenSpec changes activos**: add-connection-type-selector, add-topology-mapping-screen, add-dtc-repair-tips-screen, add-ecu-discovery-and-system-catalog (propuestos).
- **CI**: corre en `push`/`PR` a `main` y `develop`, matriz `core-api` + `ui`.
