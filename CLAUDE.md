# Intelligent Automotive Diagnostics - TFM

> Vehicular telemetry simulation & AI-powered diagnosis using MCP.
> Master IA - Jesus Novillo | Entrega: 20 julio 2026

## SESION ACTUAL

- **Fase**: 3 — Refactorizacion Clean Architecture + Hexagonal (completada)
- **Ultimo paso**: Agente @architect (OpenSpec workflow) — 5 agentes total: architect, writer, reviewer, quality, security
- **Tests**: 231 pasando (18 test files)

## REGLAS DE SESION

1. **Cargar skills necesarios** antes de empezar (ver tabla abajo)
2. **1 paso a la vez** — no mezclar responsabilidades, no adelantar trabajo
3. **TDD estricto**: RED (test que falla) → GREEN (codigo minimo) → REFACTOR
4. **Preguntar antes de commitear/pushear** — mostrar diff, esperar OK humano
5. **Checks pre-commit**: `pnpm lint && pnpm format && pnpm test && pnpm test:coverage && pnpm audit`
6. **Tras cada paso**: actualizar `SESION ACTUAL` en este mismo fichero

## AGENTES DISPONIBLES

Invoca con `@nombre` o via Task tool. Definidos en `.opencode/agents/`.

| Agente | Modelo | Rol |
|---|---|---|
| `@writer` | deepseek-v4-pro | Implementa codigo con TDD + Clean Architecture + Zod |
| `@architect` | deepseek-v4-pro | Diseña specs OpenSpec, propone cambios, mantiene coherencia entre artifacts |
| `@reviewer` | deepseek-v4-flash | Revisa TypeScript, TSDoc, Clean Architecture (read-only) |
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

El stack, arquitectura, patrones de codigo, reglas de seguridad, estado de fases
y convenciones de documentacion estan en Engram. Antes de trabajar en un area
nueva, busca contexto con `mem_search`.

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
