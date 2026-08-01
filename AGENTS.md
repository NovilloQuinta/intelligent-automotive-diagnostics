# Intelligent Automotive Diagnostics - TFM

> Vehicular telemetry simulation & AI-powered diagnosis using MCP.
> Master IA - Jesus Novillo | Entrega: 20 julio 2026

## SESION ACTUAL

- **Fase**: 4 — Diagnostico Cognitivo LLM
- **Ultimo paso**: Cambio OpenSpec `add-elm327-tcp-repository` archivado (`openspec/changes/archive/2026-08-01-add-elm327-tcp-repository/`) y spec sincronizada a main specs (`openspec/specs/elm327-tcp-repository/spec.md`, 7 requirements). Todo el flujo cerrado: implementado (c31f269) → merge a main (fast-forward) → hook gga PASSED → archive + sync specs.
- **ADR**: 009 (Adaptador ELM327 TCP) — cambio OpenSpec `add-elm327-tcp-repository` implementado, mergeado y archivado
- **Tests**: 380 pasando (28 test files)
- **CI**: verde — lint, format, test, build, audit

## REGLAS DE SESION

0. **Guardar en Engram** — tras cada accion no trivial (bugfix, decision de diseno, descubrimiento, nuevo patron), llama a `mem_save` INMEDIATAMENTE. No esperes al cierre de sesion. Si tienes duda, guarda.
1. **Orquestar antes de actuar** — ante cualquier tarea, delega en `@orchestrator`. El emite JSON de enrutamiento (agente + skills). Si el orquestador no emite JSON estructurado, es un bug — no continues sin enrutamiento explicito. **Aplica TAMBIEN a flujos OpenSpec** (`/opsx-apply`, `/opsx-archive`, ...): el CLI planifica el QUE, pero el COMO (agente + skills) lo decide `@orchestrator` antes de tocar codigo. Prohibido implementar tareas de un cambio sin enrutamiento previo.
2. **Descubrir antes de crear** — carga skills (`skill`), busca en Engram (`mem_search`), revisa el codebase. Prohibido reescribir logica que ya exista. Los agentes orquestan skills; no escriben logica monolítica.
3. **1 paso a la vez** — no mezclar responsabilidades, no adelantar trabajo
4. **TDD estricto**: RED (test que falla) → GREEN (codigo minimo) → REFACTOR
5. **Trabajar en ramas, NO en main** — cada cambio en su rama (`git checkout -b feat/xxx` o `fix/xxx`). Solo merge a main cuando CI pase verde. Cambios menores (docs, chore, style) directo a main.
6. **Checks pre-push**: `pnpm lint && pnpm format && pnpm test && pnpm build`
7. **Preguntar antes de commitear/pushear** — mostrar resumen de cambios, esperar OK humano
8. **Tras cada paso**: actualizar `SESION ACTUAL` en este mismo fichero
9. **Auto-auditoria post-tarea** — al terminar una tarea no trivial: skills usadas, agentes delegados, codigo nuevo estrictamente necesario.

## AGENTES DISPONIBLES

Invoca con `@nombre` o via Task tool. Definidos en `.opencode/agents/`.

| Agente | Modelo | Rol |
|---|---|---|
| `@orchestrator` | deepseek-v4-pro | Enruta tareas al sub-agente y skill correctos. Salida JSON estructurada. |
| `@writer` | deepseek-v4-pro | Implementa codigo con TDD + Clean Architecture + Zod |
| `@architect` | deepseek-v4-pro | Disena specs OpenSpec, propone cambios, mantiene coherencia entre artifacts |
| `@reviewer` | deepseek-v4-flash | Revisa TypeScript, TSDoc, Clean Architecture, DRY, KISS, code smells (read-only) |
| `@quality` | deepseek-v4-flash | Ejecuta lint + test + coverage + audit y reporta |
| `@security` | deepseek-v4-flash | Audita reglas OWASP: CORS, helmet, JWT, rate-limit, Zod (read-only) |

## SKILLS

| Skill | Path | Cuando cargar |
|---|---|---|
| `clean-architecture` | `.opencode/skills/clean-architecture/` | Antes de crear/mover ficheros entre capas |
| `typescript-best-practices` | `.opencode/skills/typescript-best-practices/` | Al escribir o revisar TypeScript |
| `tdd-workflow` | `.opencode/skills/tdd-workflow/` | Antes de escribir tests o ciclo Red-Green-Refactor |
| `tsdoc-jsdoc-documentation` | `.opencode/skills/tsdoc-jsdoc-documentation/` | Antes de crear o revisar TSDoc en exports publicos |
| `coverage-strategy` | `.opencode/skills/coverage-strategy/` | Al configurar thresholds, revisar coverage, o decidir que testear |
| `openspec-propose` | `.opencode/skills/openspec-propose/` | Al proponer un cambio nuevo (design + specs + tasks) |
| `openspec-apply-change` | `.opencode/skills/openspec-apply-change/` | Al implementar tareas de un cambio OpenSpec |
| `openspec-archive-change` | `.opencode/skills/openspec-archive-change/` | Al archivar un cambio completado |
| `openspec-explore` | `.opencode/skills/openspec-explore/` | Modo exploracion — pensar sin implementar |
| `openspec-update-change` | `.opencode/skills/openspec-update-change/` | Al actualizar artifacts de un cambio existente |
| `openspec-sync-specs` | `.opencode/skills/openspec-sync-specs/` | Al sincronizar delta specs con main specs |

## MEMORIA PERSISTENTE (Engram)

Engram es un "segundo cerebro". Guarda lo que **no es obvio** del codigo.
Antes de trabajar en un area nueva, busca contexto con `mem_search`.

**Que guardar** (proactivo, regla #0 — NO esperar):
- Bugs y sus causas raiz (el "por que pasaba", no el diff — eso ya esta en git)
- Decisiones de diseno no obvias (ej. "factory functions vs clases porque...")
- Discoveries / gotchas (ej. "SQLite no soporta X, asi que usamos Y")
- Cambios de reglas de sesion o preferencias del usuario

**Que NO guardar**:
- Artifacts OpenSpec — ya estan en `openspec/changes/`
- Tareas completadas — para eso esta `mem_session_summary`
- Cosas que cualquier agente puede deducir leyendo el codigo

## PRINCIPIOS DE CODIGO

`@reviewer` evalua estos principios en cada revision:

- **DRY** — Sin duplicacion de logica no trivial. Si un patron se repite 3+ veces, extraer a funcion/utilidad compartida. Excepcion: tests.
- **KISS** — La solucion mas simple posible. Sin abstracciones prematuras, sin factory de factories. Una funcion = una responsabilidad clara.
- **Code Smell** — Funciones >40 lineas, parametros >4, anidamiento >3 niveles, comentarios explicando QUE hace el codigo, magic strings/numbers sin nombre, imports no usados.

## Scripts

```bash
# OBD (raiz)
pnpm tsx scripts/send-obd.ts "01 0C"    # enviar comando OBD al emulador
pnpm tsx scripts/scan-pids.ts           # escanear PIDs soportados

# DB (apps/core-api)
pnpm drizzle-kit generate               # generar migraciones desde schema.ts
pnpm drizzle-kit migrate                # aplicar migraciones a SQLite

# Tests
pnpm test                               # vitest run
pnpm test:coverage                      # coverage (Features >=80% + Core 100%)
```
