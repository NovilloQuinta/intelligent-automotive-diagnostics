# Plan de trabajo en paralelo — demo TFM

Cuatro flujos, tres de ellos en paralelo. El cuarto espera.

## Mapa de colisiones

Estos ficheros los toca más de un flujo. Son la razón del orden:

| Fichero | A (arreglos) | B (chat) | C (publicar) | D (modos OBD) |
|---|---|---|---|---|
| `infrastructure/elm327/elm327Adapter.ts` | ★ mucho | — | — | ★ mucho |
| `infrastructure/services/diagnosisService.ts` | ★ | ligero | — | ★ |
| `infrastructure/http/controllers/DiagnosisController.ts` | ★ | ligero | — | ★ |
| `infrastructure/http/routes/diagnosis.routes.ts` | ★ | — | — | ★ |
| `docker/elm327/scenarios/*.py` | ★ | — | — | ★ |
| `apps/ui/.../DashboardPage.tsx` | ★ | ★ | — | ligero |
| `apps/ui/.../DtcPanel.tsx` | — | — | — | ★ |
| `docker-compose.yml`, `Dockerfile`, config | — | — | ★ | — |

**A y D chocan de frente.** Por eso D espera a que A esté mergeado en `develop`.

---

## Flujo A — Los 5 arreglos (EN MARCHA)

- Rama: `fix/vehicle-identity-and-live-data`
- Prompt: `prompt-opencode.md`
- Estado: arreglo 1 (descripciones DTC) hecho; quedan refresco al cambiar de vehículo, identificación, freeze frame y telemetría real.

## Flujo B — Chat con el mecánico

- Rama: `feat/mechanic-chat`
- Prompt: `prompt-opencode-chat.md`
- Puede empezar ya. Solape con A: `DashboardPage.tsx` y el controlador, ambos ligeros. Al mergear, A primero y B después.

## Flujo C — Publicar la web

- Rama: `chore/deploy-demo`
- Prompt: pendiente de escribir.
- **Cero solape con el resto.** Es el más seguro de lanzar en paralelo.
- Objetivo: que el profesor entre desde fuera y lo vea todo funcionando contra los emuladores Docker, sin depender de que haya un coche conectado.

## Flujo D — Modos OBD que faltan (ESPERA A QUE A ESTÉ MERGEADO)

- Rama: `feat/obd-standard-modes`
- Prompt: pendiente de escribir.
- **Un solo agente para las tres cosas**, porque comparten ficheros:
  1. **Borrar códigos** (Mode 04) — `clearDtcCodes()` ya existe en el adaptador; faltan endpoint y botón.
  2. **Testigo MIL y monitores de emisiones** (Mode 01 PID 01) — luz encendida o no, nº de averías, si pasaría la ITV.
  3. **Averías pendientes (Mode 07) y permanentes (Mode 0A)** — mismo parser que Mode 03, tres listas en vez de una.
- Hay que añadir esos modos a los escenarios `.py`, que hoy no responden a ellos.

---

## Comandos de worktree

Uno por flujo, siempre desde `develop`:

```
git worktree add .claude/worktrees/mechanic-chat -b feat/mechanic-chat develop
git worktree add .claude/worktrees/deploy-demo -b chore/deploy-demo develop
```

Y cuando A esté mergeado:

```
git worktree add .claude/worktrees/obd-modes -b feat/obd-standard-modes develop
```

Al cerrar cada uno:

```
git worktree remove .claude/worktrees/<nombre>
```

**Regla crítica** (regla 5b de `AGENTS.md`): todo agente que trabaje en un worktree DEBE escribir en la ruta del worktree, nunca en el repo principal. Si un agente escribe en `/home/ubuntu/projects/intelligent-automotive-diagnostics/apps/...` estando asignado a un worktree, para y corrige antes de seguir.

## Orden de merge a `develop`

1. A (arreglos)
2. C (publicar) — independiente, puede entrar en cualquier momento
3. B (chat)
4. D (modos OBD)

Cada uno con CI en verde antes de mergear, y con OK humano.
