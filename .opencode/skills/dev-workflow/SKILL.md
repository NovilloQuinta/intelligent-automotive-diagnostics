---
name: dev-workflow
description: Ciclo de vida completo de desarrollo en el proyecto — worktree, rama, commit, push, merge y limpieza. Usar al INICIAR un desarrollo nuevo y al FINALIZAR cuando se mergea a develop.
---

# Ciclo de vida de desarrollo

Cada cambio de codigo sigue este ciclo completo. La disciplina de worktrees
y ramas esta definida en AGENTS.md (reglas 5, 5b).

## Fase 1: Inicio — crear rama + worktree

```bash
# Desde la raiz del repo principal, en develop limpio
git checkout develop && git pull origin develop

# Crear worktree + rama nueva desde develop
git worktree add -b feat/<nombre> .claude/worktrees/<nombre> develop
```

Reglas:
- La rama es `feat/<nombre>` o `fix/<nombre>`, siempre desde `develop`.
- El worktree va en `.claude/worktrees/<mismo-nombre>/`.
- El worktree comparte `node_modules` con el repo principal (pnpm workspace).

## Fase 2: Desarrollo

- Todo agente DEBE escribir en la ruta del worktree (`.claude/worktrees/<nombre>/`),
  NUNCA en el repo principal. Regla 5b.
- TDD estricto: RED → GREEN → REFACTOR (regla 4).
- Commits atomicos dentro de la rama. Si GGA falla 2 veces seguidas, forzar con
  `git commit --no-verify` y documentar los errores en `docs/gga-pending-errors.md`
  para corregirlos despues.
- Push frecuente: `git push origin feat/<nombre>`.

## Fase 3: Merge a develop

Cuando el desarrollo esta completo y CI pasa (build + lint + tests):

```bash
# Desde el repo PRINCIPAL (NO el worktree)
git checkout develop && git pull origin develop
git merge feat/<nombre>
git push origin develop
```

## Fase 4: Limpieza — borrar rama + worktree

Inmediatamente despues del merge exitoso:

```bash
# Eliminar worktree (si existe)
git worktree remove .claude/worktrees/<nombre> 2>/dev/null

# Eliminar rama local
git branch -d feat/<nombre>

# Eliminar rama remota
git push origin --delete feat/<nombre>
```

Si el worktree ya no existe pero la rama aun esta:
```bash
git branch -D feat/<nombre>                    # forzar delete local
git push origin --delete feat/<nombre>         # delete remoto
```

## Notas

- Cambios menores (docs, chore, style) van directo a `develop` sin worktree
  (regla 5). No aplica este ciclo.
- Si el desarrollo se abandona (no se mergea), borrar rama + worktree igual.
