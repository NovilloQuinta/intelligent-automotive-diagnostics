# Estado actual

> Lo mantiene la regla 8 de `AGENTS.md`. Maximo 15 lineas, **solo estado presente**.
> El historial va a git, a `openspec/changes/archive/` y a Engram — nunca aqui.
>
> Vive fuera de `AGENTS.md` a proposito: es la parte que cambia en cada tarea, y
> tenerla mezclada con las reglas obligaba a recargar el fichero entero en cada agente.

- **Fase**: 4 — Diagnostico Cognitivo LLM / Refactor Arquitectura + deploy a produccion
- **Ultimo paso**: `add-topology-mapping-screen` implementado (21/22 tareas; la 10.3, e2e, queda opcional). Nueva pestana "Topologia" en el dashboard: `TopologyMapPanel` dibuja en SVG las mismas `EcuInfo` que ya alimentan `EcuInfoPanel` — nodos coloreados por tipo sobre una linea de bus, seleccionables (raton y teclado) con tarjeta de detalle. Sin dato ni endpoint nuevo. Tambien: `ecuTopologyColors` (paleta semantica reutilizando `COLORS`, gris neutro para tipos no catalogados) y `ecuMessages` (mensajes de estado compartidos con `EcuInfoPanel`). +23 tests de UI.
- **Coche real**: sesion aplazada a manana. `develop` verde y verificada.
- **Ultimo paso**: `add-ecu-discovery-and-system-catalog` mergeado a `develop` (commit `eb5e58b`). Backend solo: auto-scan CAN real de ECUs (`AT SH 7DF` + `01 00`, fallback `09 0A`), catálogo auto-expansivo de ECUs (`ecu_definitions` SQLite + `ecus_index` LanceDB — opción B: vacío + aprendizaje, tools `search_similar_ecus`/`index_ecu`), `system` en `pid_definitions`, `pid_readings` autodescriptivo (`mode`/`pid_code` + `session_id` FK), migración `0005`. Conflicto resuelto con el refactor de `mcpServer.ts` a módulos (`diagnosticTools`/`knowledgeTools`).
- **Flujo de ramas**: `develop` es la rama de integración; toda `feat.*`/`fix.*` sale de `develop` y se mergea ahí. `main` = releases (deploy CI). **Ojo**: hay agentes paralelos en el repo principal (rama cambia sola) — verificar `git branch --show-current` antes de commitear.
- **Rama base**: `develop` (no == `main`; deploy via `main`).
- **Worktrees activos** en `.claude/worktrees/`: `deployment` (`feat/deployment`, obsoleto).
- **OpenSpec changes activos**: add-connection-type-selector, add-topology-mapping-screen, add-dtc-repair-tips-screen.
- **CI**: corre en `push`/`PR` a `main` y `develop`, matriz `core-api` + `ui`.
