# Intelligent Automotive Diagnostics — Referencia rapida

> La fuente de verdad es `AGENTS.md`. Alli estan las reglas completas, agentes, skills y scripts.
> Este fichero contiene solo lo esencial para arranque rapido de OpenCode.

## REGLAS DE SESION (resumen)

0. **Guardar en Engram** — tras cada accion no trivial, `mem_save` INMEDIATAMENTE
1. **Orquestar antes de actuar** — delega en `@orchestrator`
2. **Descubrir antes de crear** — `mem_search` + `skill` + codebase
3. **1 paso a la vez** — no mezclar responsabilidades
4. **TDD estricto**: RED → GREEN → REFACTOR
5. **Ramas, NO main** — cada cambio en su rama
6. **Checks pre-push**: `pnpm lint && pnpm format && pnpm test && pnpm build`
7. **Preguntar antes de commitear/pushear**
8. **Actualizar SESION ACTUAL en AGENTS.md**

## AGENTES

`@orchestrator` → `@writer` | `@architect` | `@reviewer` | `@quality` | `@security`

## SESION ACTUAL

- **Fase**: 4 — Diagnostico Cognitivo LLM
- **Ultimo paso**: Commit de herramientas complementarias (gga, gentle-agent-state, Gentleman-Skills) + AGENTS.md como fuente de verdad (commit 12508c1)
- **ADR**: 007 (Catalogo Auto-Expansivo con LanceDB)
- **Tests**: 257 pasando (22 test files)
- **CI**: verde
