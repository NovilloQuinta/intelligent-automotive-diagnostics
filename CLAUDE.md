# Intelligent Automotive Diagnostics

> Fuente de verdad: `AGENTS.md` (reglas, agentes, skills, deuda). **Lelo antes de trabajar.**

## Puente `.opencode/` <-> `.claude/`

| Componente | Fuente | Wrapper `.claude/` |
|---|---|---|
| Agentes (6) | `.opencode/agents/*.md` | copia adaptada |
| Skills (11) | `.opencode/skills/*/SKILL.md` | wrapper fino |
| Comandos (6) | `.opencode/commands/*.md` | wrapper fino |

1. Lee la fuente `.opencode/` antes de usar un wrapper.
2. No edites `.claude/` sin actualizar `.opencode/`.
3. Todo nuevo en `.opencode/` necesita su wrapper.

## Comandos

```bash
pnpm lint && pnpm format && pnpm test && pnpm build   # pre-push
pnpm test:coverage                                    # coverage: Features >=80% + Core 100%
```
