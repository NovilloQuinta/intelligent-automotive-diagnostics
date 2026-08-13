# Estado actual

> Lo mantiene la regla 8 de `AGENTS.md`. Maximo 15 lineas, **solo estado presente**.
> El historial va a git, a `openspec/changes/archive/` y a Engram — nunca aqui.
>
> Vive fuera de `AGENTS.md` a proposito: es la parte que cambia en cada tarea, y
> tenerla mezclada con las reglas obligaba a recargar el fichero entero en cada agente.

- **Fase**: 4 — Diagnostico Cognitivo LLM / Refactor Arquitectura + deploy a produccion
- **Ultimo paso**: `feat/ui-header-footer-freeze-frame` mergeado a `develop` (commit `4fad0eb`). UI: (1) `Header` compartido (logo + acciones auth, `showAuthActions`) + `FooterSection` reutilizado en login/registro, perfil, historial y detalle historial (botones auth ocultos en páginas auth); (2) freeze frame legible — `buildPidLabelMap()` mapea short-PID → nombre+unidad vía `GET /api/available-pids` en `FreezeFramePanel` y `SessionReportPanel`, degrada a hex si el PID no está catalogado. Solo frontend. Antes: `fix/gga-pending-errors` (af3bcaa) — DRY `runDiagnosisHandler` + bug de contrato del historial.
- **Flujo de ramas**: `develop` es la rama de integración; toda `feat.*`/`fix.*` sale de `develop` y se mergea ahí. `main` = releases (deploy CI). **Ojo**: hay agentes paralelos en el repo principal (rama cambia sola) — verificar `git branch --show-current` antes de commitear.
- **Rama base**: `develop` (no == `main`; deploy via `main`).
- **Worktrees activos** en `.claude/worktrees/`: `add-ecu-discovery-and-system-catalog` (`feat/add-ecu-discovery-and-system-catalog`), `deployment` (`feat/deployment`, obsoleto).
- **OpenSpec changes activos**: add-connection-type-selector, add-topology-mapping-screen, add-dtc-repair-tips-screen, add-ecu-discovery-and-system-catalog (propuestos).
- **CI**: corre en `push`/`PR` a `main` y `develop`, matriz `core-api` + `ui`.
