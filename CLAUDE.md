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

## PUENTE .opencode/ <-> .claude/ (IMPORTANTE)

La **fuente de verdad** de agentes, skills y comandos está en `.opencode/`
(formato OpenCode). Claude Code lee `.claude/`. La estructura `.claude/` contiene
**wrappers** que adaptan el frontmatter y referencian la fuente única:

| Componente | Fuente (verdad) | Wrapper (Claude Code) |
|---|---|---|
| Agentes (6) | `.opencode/agents/*.md` | `.claude/agents/*.md` — copia adaptada (frontmatter `model`/`tools` distinto) |
| Skills (11) | `.opencode/skills/<name>/SKILL.md` | `.claude/skills/<name>/SKILL.md` — wrapper fino que ordena leer la fuente |
| Comandos (6) | `.opencode/commands/*.md` | `.claude/commands/*.md` — wrapper fino que ordena leer la fuente |

**Reglas:**
1. **Siempre lee la fuente de `.opencode/`** antes de usar un skill o comando wrapper.
2. Nunca edites el contenido duplicado en `.claude/` sin actualizar `.opencode/`.
3. Si agregas un skill/agente/comando nuevo en `.opencode/`, crea su wrapper en `.claude/`.

## SESION ACTUAL

- **Fase**: 4 — Diagnostico Cognitivo LLM
- **Ultimo paso**: Cambio `add-execute-cognitive-diagnosis` implementado y archivado en OpenSpec. Refactoring post-archivado commiteado (`50c0a5e`): tipos extraidos a `application/ports/cognitiveDiagnosis.port.ts`, shims eliminados, regex JSON mejorado (tolera `---JSON\n` de DeepSeek), schema Zod exportado como `cognitiveDiagnosisJsonSchema`. SYSTEM INSTRUCTIONS & EXECUTIVE PROTOCOL integrado en AGENTS.md, commiteado (`f257ed2`).
- **Tests**: 404 pasando (29 test files)
- **CI**: verde — lint, format, test, build, audit
