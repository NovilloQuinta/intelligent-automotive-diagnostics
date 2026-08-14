# Estado actual

> Lo mantiene la regla 8 de `AGENTS.md`. Maximo 15 lineas, **solo estado presente**.
> El historial va a git, a `openspec/changes/archive/` y a Engram — nunca aqui.
>
> Vive fuera de `AGENTS.md` a proposito: es la parte que cambia en cada tarea, y
> tenerla mezclada con las reglas obligaba a recargar el fichero entero en cada agente.

- **Fase**: 4 — Diagnostico Cognitivo LLM / Refactor Arquitectura + deploy a produccion
- **Ultimo paso**: allowlist de servicios OBD en `domain/obdServiceMode.ts`. `fetchPidBytes` es el unico punto por el que sale al bus un modo elegido por el LLM y ahora valida contra `READ_ONLY_OBD_MODES` (01, 02, 03, 05, 06, 07, 09, 0A, 22): los servicios de control (`2F`, `31`, `11`, `2E`...) se rechazan con `UnsafeObdModeError` **antes** de tocar el socket. El riesgo real no era una alucinacion exotica sino transponer `mode`/`pid` — `2F` es nivel de combustible como PID y control de actuadores como modo — asi que el error sugiere la lectura equivalente en Mode 01. Mode 04 (borrado de DTC) sigue siendo la unica escritura y solo por `clearDtcCodes()`; `OBD_READ_ONLY=true` lo bloquea tambien.
- **Sesion ELM327**: el transporte negocia (`ATZ/ATE0/ATL0/ATS1/ATH0/ATSP0/0100`) antes de la primera lectura y tras cada reconexion; `ATS1` es obligatorio porque el parser separa bytes por espacios. Fallos de bus como `Elm327BusError`. Traza con `OBD_TRACE=true`. El emulador se construye sin negociacion: la demo web no cambia.
- **Identificación del vehículo**: ya no sale de una tabla en `vin.ts` sino de la cascada de siempre (BBDD → catálogo `vehicle_identities` → web → mecánico), en `ResolveVehicleIdentityUseCase` + `ConfirmVehicleIdentityUseCase`. Motivo: un WMI no previsto dejaba `make: unknown` y con él todo lo aprendido de ese coche bajo `unknown/unknown` en el catálogo RAG. Las 23 marcas pasan a seed de BBDD, como los PID Mode 01.
- **Abierto, no bloquea**: `stripEcho` sigue borrando la linea 0 en su ruta de fallback (mitigado: `parseModeResponse` prueba antes la ruta multi-linea); `getSupportedPids` solo lee PIDs 01-20, falta encadenar `01 20`/`01 40`.
- **Siguiente paso**: correr `pnpm eval:agent --only=B,C,D,E` con la clave local y calibrar el prompt con las respuestas delante. Detalle en `docs/deuda-conocida.md`.
- **Con el coche**: apuntar el VIN real. Si el fabricante sale `unknown` en el wizard, se identifica a mano ahí mismo y queda aprendido; el paso web necesita `WEB_SEARCH_API_KEY`, que es opcional.
- **Coche real**: sesion **hoy**, en local por cable USB (`OBD_MODE=serial`). El VPS no puede ver el dongle; `diag.jcodinglabs.com` se queda con los 3 emulados. Orden: `pnpm obd:probe` en la mesa -> pegar bloque en `.env` (con `OBD_READ_ONLY=true`: bloquea el borrado de DTC, que es irreversible en un coche real) -> `pnpm start` -> coche con el contacto puesto y nadie con las manos en el vano.
- **OpenSpec changes activos**: `add-connection-type-selector` (13 tareas, el mas relevante para la demo por cable), `add-dtc-repair-tips-screen` (49 tareas).
- **Flujo de ramas**: `develop` es la rama de integración; toda `feat.*`/`fix.*` sale de `develop` y se mergea ahí. `main` = releases (deploy CI). **Ojo**: hay agentes paralelos en el repo principal (rama cambia sola) — verificar `git branch --show-current` antes de commitear.
- **Rama base**: `develop` (no == `main`; deploy via `main`).
- **Worktrees activos** en `.claude/worktrees/`: `deployment` (`feat/deployment`, obsoleto).
- **CI**: corre en `push`/`PR` a `main` y `develop`, matriz `core-api` + `ui`, con `typecheck` tras el build.
- **Gate local**: `pnpm verify` (lint + format + test + build + typecheck de ambas apps).
- **Deuda**: en `docs/deuda-conocida.md`, con cifras medidas. Pendientes de borrar desde la UI de GitHub (el proxy de git del entorno remoto responde 403 al `push --delete`, y el MCP de GitHub no expone borrado de ramas): `refactor/split-mcp-server`, `claude/client-profile-password-recovery-2fwi91` y `claude/preparacion-conectar-coche-m8kt2c` — las tres ya contenidas en `develop`. `feat/deployment` tiene 2 commits sin mergear, pero su contenido ya esta en `main` por otra via: obsoleta, borrable tambien.
