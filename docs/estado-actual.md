# Estado actual

> Lo mantiene la regla 8 de `AGENTS.md`. Maximo 15 lineas, **solo estado presente**.
> El historial va a git, a `openspec/changes/archive/` y a Engram — nunca aqui.
>
> Vive fuera de `AGENTS.md` a proposito: es la parte que cambia en cada tarea, y
> tenerla mezclada con las reglas obligaba a recargar el fichero entero en cada agente.

- **Fase**: 4 — Diagnostico Cognitivo LLM / Refactor Arquitectura + deploy a produccion
- **Ultimo paso**: `fix/ui-auth-header-navigation` **mergeado a develop** (8e8a69a). `Header` ahora es auth-aware: navegacion (Inicio/Historial/Perfil/Cerrar sesion) en perfil/historial/detalle; `RequiredLabel` extraido a `components/auth/` y aplicado al email de recuperar contraseña. `pnpm verify` verde (incluye `chore` prettier de `ValidationResult.ts`, que estaba sin formatear en develop).
- **Pendiente (trabajo paralelo sin commitear)**: en el worktree principal hay cambios **sin commitear** en `ForgotPasswordUseCase.ts` + `templates/resetPasswordEmail.ts` + tests (extraccion del email de reset). No tocar sin coordinar.
- **Coche real**: sesion aplazada a manana.
- **OpenSpec changes activos**: `add-connection-type-selector` (13 tareas, el mas relevante para la demo por cable), `add-dtc-repair-tips-screen` (49 tareas).
- **Flujo de ramas**: `develop` es la rama de integración; toda `feat.*`/`fix.*` sale de `develop` y se mergea ahí. `main` = releases (deploy CI). **Ojo**: hay agentes paralelos en el repo principal (rama cambia sola) — verificar `git branch --show-current` antes de commitear.
- **Rama base**: `develop` (no == `main`; deploy via `main`).
- **Worktrees activos** en `.claude/worktrees/`: `deployment` (`feat/deployment`, obsoleto).
- **CI**: corre en `push`/`PR` a `main` y `develop`, matriz `core-api` + `ui`, con `typecheck` tras el build.
- **Gate local**: `pnpm verify` (lint + format + test + build + typecheck de ambas apps).
- **Deuda**: en `docs/deuda-conocida.md`, con cifras medidas. Rama `origin/refactor/split-mcp-server` pendiente de borrar desde la UI de GitHub (el proxy de git del entorno remoto no lo permite).
