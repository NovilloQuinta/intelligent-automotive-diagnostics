# Intelligent Automotive Diagnostics - TFM

> Vehicular telemetry simulation & AI-powered diagnosis using MCP.
> Master IA - Jesus Novillo | Entrega: 20 julio 2026

## SESION ACTUAL

- **Fase**: 3 — Refactorizacion Clean Architecture + Hexagonal (completada)
- **Ultimo paso**: Configuracion multi-agente (4 subagentes: writer, reviewer, quality, security) + CLAUDE.md adelgazado + Engram poblado
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
