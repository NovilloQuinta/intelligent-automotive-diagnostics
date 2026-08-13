# Intelligent Automotive Diagnostics

> Fuente de verdad: `AGENTS.md` (reglas, agentes, skills). **Lelo antes de trabajar.**
> Estado de sesion en `docs/estado-actual.md`, deuda en `docs/deuda-conocida.md`.

## Puente `.opencode/` <-> `.claude/`

| Componente | Fuente | En `.claude/` |
|---|---|---|
| Skills (13) | `.opencode/skills/*/SKILL.md` | **symlink** a la fuente |
| Comandos (6) | `.opencode/commands/*.md` | **symlink** a la fuente |
| Agentes (7) | `.opencode/agents/*.md` | copia adaptada (frontmatter incompatible) |

1. Skills y comandos son **un solo fichero**: editar `.opencode/` es editar `.claude/`.
   No hay que leer la fuente aparte, y no hay que sincronizar nada.
2. Los agentes SI son copias: `.opencode/` usa frontmatter de OpenCode
   (`mode: subagent`, `permission:`) y `.claude/` el de Claude Code (`tools:`, `model:`).
   Al tocar uno, actualiza el otro.
3. Todo skill/comando nuevo en `.opencode/` necesita su symlink:
   `ln -s ../../../.opencode/skills/<x>/SKILL.md .claude/skills/<x>/SKILL.md`
4. Invoca skills con la tool `Skill` por nombre. No las leas con `Read`.

## Comandos

```bash
pnpm verify                # gate pre-push completo (lint+format+test+build, core-api+ui)
pnpm test:all              # tests de ambas apps
pnpm test:coverage         # coverage core-api (Features >=80% + Core 100%)
VITEST_VERBOSE=1 pnpm test # arbol completo + logs, solo para depurar
```
