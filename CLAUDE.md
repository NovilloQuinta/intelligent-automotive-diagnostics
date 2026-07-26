# Intelligent Automotive Diagnostics - TFM

> Vehicular telemetry simulation & AI-powered diagnosis using MCP.
> Master IA - Jesus Novillo | Entrega: 20 julio 2026

## SESION ACTUAL

- **Fase**: 4 — Diagnostico Cognitivo LLM
- **Ultimo paso**: Propuesta add-openai-client-adapter (OpenAI-compatible generico) — Fase 4
- **Tests**: 257 pasando (22 test files)
- **CI**: verde — lint, format, test, build, audit

## REGLAS DE SESION

1. **Cargar skills necesarios** antes de empezar (ver tabla abajo)
2. **1 paso a la vez** — no mezclar responsabilidades, no adelantar trabajo
3. **TDD estricto**: RED (test que falla) → GREEN (codigo minimo) → REFACTOR
4. **Trabajar en ramas, NO en main** — cada cambio en su rama (`git checkout -b feat/xxx` o `fix/xxx`). Solo merge a main cuando CI pase verde. Cambios menores (docs, chore, style) directo a main.
5. **Checks pre-push**: `pnpm lint && pnpm format && pnpm test && pnpm build`
6. **Preguntar antes de commitear/pushear** — mostrar resumen de cambios, esperar OK humano
7. **Tras cada paso**: actualizar `SESION ACTUAL` en este mismo fichero
8. **Check pre-cierre** — antes de terminar sesion, preguntarse: "¿hice algo que un agente nuevo no deduciria solo leyendo el codigo?" Si la respuesta es si → `mem_save`.

## AGENTES DISPONIBLES

Invoca con `@nombre` o via Task tool. Definidos en `.opencode/agents/`.

| Agente | Modelo | Rol |
|---|---|---|
| `@writer` | deepseek-v4-pro | Implementa codigo con TDD + Clean Architecture + Zod |
| `@architect` | deepseek-v4-pro | Diseña specs OpenSpec, propone cambios, mantiene coherencia entre artifacts |
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

Engram es un "segundo cerebro", no un gestor documental. Guarda lo que **no es obvio**
del codigo: bugs y sus causas, decisiones de diseño, gotchas, preferencias del usuario.
Antes de trabajar en un area nueva, busca contexto con `mem_search`.

**Que guardar** (proactivo, con criterio):
- Bugs y sus causas raiz (el "por que pasaba", no el diff — eso ya esta en git)
- Decisiones de diseño no obvias (ej. "factory functions vs clases porque...")
- Discoveries / gotchas (ej. "SQLite no soporta X, asi que usamos Y")
- Cambios de reglas de sesion o preferencias del usuario

**Que NO guardar**:
- Artifacts OpenSpec — ya estan en `openspec/changes/`, el repo es la fuente de verdad
- Tareas completadas — para eso esta `mem_session_summary` al cerrar sesion
- Cosas que cualquier agente puede deducir leyendo el codigo

## PRINCIPIOS DE CODIGO

`@reviewer` evalua estos principios en cada revision:

- **DRY** — Sin duplicacion de logica no trivial. Si un patron se repite 3+ veces, extraer a funcion/utilidad compartida. Excepcion: tests (aceptable cierto nivel de repeticion para claridad).
- **KISS** — La solucion mas simple posible. Sin abstracciones prematuras, sin factory de factories. Una funcion = una responsabilidad clara.
- **Code Smell** — Funciones >40 lineas, parametros >4, anidamiento >3 niveles, comentarios explicando QUE hace el codigo (deberia ser obvio), magic strings/numbers sin nombre, imports no usados.

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
