# Intelligent Automotive Diagnostics - TFM

> Vehicular telemetry simulation & AI-powered diagnosis using MCP.
> Master IA - Jesus Novillo | Entrega: 20 julio 2026

## SESION ACTUAL

- **Fase**: 2b — Hardening produccion (AUTH + RATE + LOG)
- **Paso**: D4 completado con TDD → D5 — migracion lint:docs a eslint-plugin-jsdoc completada
- **Skills cargados**: tdd-workflow, typescript-best-practices, tsdoc-jsdoc-documentation
- **Tests**: 161 pasando
- **Ficheros creados/modificados**:
  - `apps/core-api/eslint.config.mjs` (jsdoc/require-jsdoc con publicOnly, 9 archivos actualizados)
  - `apps/core-api/scripts/lint-docs.ts` (eliminado — reemplazado por eslint-plugin-jsdoc)
  - `package.json` (lint:docs eliminado del script raiz)
  - `.opencode/skills/{clean-architecture,coverage-strategy,tsdoc-jsdoc-documentation}/SKILL.md` (referencias actualizadas)
  - `CLAUDE.md`, `README.md`, `docs/README.md` (referencias actualizadas)

## REGLAS DE SESION

1. **Cargar skills necesarios** antes de empezar (ver tabla abajo)
2. **1 paso a la vez** — no mezclar responsabilidades, no adelantar trabajo
3. **TDD estricto**: RED (test que falla) → GREEN (codigo minimo) → REFACTOR
4. **Preguntar antes de commitear/pushear** — mostrar diff, esperar OK humano
5. **Checks pre-commit**: `pnpm lint && pnpm format && pnpm test && pnpm test:coverage && pnpm coverage:core && pnpm audit`
6. **Tras cada paso**: actualizar `SESION ACTUAL` en este mismo fichero

## SKILLS

| Skill | Path | Cuando cargar |
|---|---|---|
| `clean-architecture` | `.opencode/skills/clean-architecture/` | Antes de crear/mover ficheros entre capas |
| `typescript-best-practices` | `.opencode/skills/typescript-best-practices/` | Al escribir o revisar TypeScript |
| `tdd-workflow` | `.opencode/skills/tdd-workflow/` | Antes de escribir tests o ciclo Red-Green-Refactor |
| `tsdoc-jsdoc-documentation` | `.opencode/skills/tsdoc-jsdoc-documentation/` | Antes de crear o revisar TSDoc en exports publicos |
| `coverage-strategy` | `.opencode/skills/coverage-strategy/` | Al configurar thresholds, revisar coverage, o decidir que testear |

## PATRONES DE CODIGO

- **Factory functions**, no clases (ej. `createServer`, `createDiagnosisController`)
- **Interface en `application/ports/`**, implementacion en `infrastructure/`
- **Zod** para validar todo input externo (nunca usar `req.body` sin `safeParse`)
- **Named exports** siempre, nunca `export default`
- **1 fichero = 1 responsabilidad** (KISS, YAGNI, DRY con criterio)

---

## Stack

- **Runtime**: Node 20+ (ESM) · TypeScript 5.7+ estricto
- **Framework**: Express 5 + Zod + Helmet
- **IA/Agentes**: `@modelcontextprotocol/sdk`
- **Persistencia**: SQLite + Drizzle ORM · (LanceDB: pendiente Fase 2b)
- **Tests**: Vitest 3 · **Package manager**: pnpm · **Tooling**: tsx (dev), tsc (build)
- **Normativa**: SAE J1979, ISO 15031-5, ISO 3779 (VIN)

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
pnpm test:coverage                      # coverage (Features >=80% per-file)
pnpm coverage:core                      # CI script: Core 100%
```

## Arquitectura (Clean Architecture + MCP)

```
apps/core-api/src/
├── domain/entities/             # Entidades puras (User, VehicleProfile, PidDefinition...)
├── application/                 # Puertos + Casos de uso
│   ├── ports/                   # obdRepository, vehicleRepository, userRepository
│   └── diagnostics/             # processVehicleDiagnosis (core del sistema)
├── infrastructure/              # Adaptadores tecnicos
│   ├── hardware-simulator/      # obdSimulator, simulationScenario
│   ├── http/                    # server.ts (Express), controllers, middleware
│   ├── obd/protocol/            # pidParser (Shunting-yard, SAE J1979), vinDecoder
│   ├── persistence/sqlite/      # schema, db, vehicleRepository, userRepository
│   ├── persistence/vector/      # LanceDB (pendiente)
│   └── mcp/                     # mcpServer.ts (6 tools)
└── main.ts                      # Composition root (Express :4000)
```

## Estado del proyecto

| Fase | Estado |
|---|---|
| Fase 1 — Express API + ELM327-emulator Docker | Completada |
| Fase 2a — SQLite/Drizzle + PidParser + catalogo + API tests | Completada |
| Hardening OWASP A01-A08 (helmet, CORS, Zod, timeout, CI) | Completado |
| Fase 2b — Hardening produccion (AUTH + RATE + LOG) | **En curso** |
| Pendiente — LanceDB + LLM + TCP OBD + docs finales | Sin empezar |

## Seguridad

### No regresiones (inviolable)

- **Nunca** cambiar CORS de vuelta a `*`
- **Nunca** quitar `helmet()` del pipeline
- **Nunca** desactivar el error handler global o exponer stack traces
- **Nunca** usar `req.body` sin validar con Zod en nuevos endpoints
- **Siempre** timeout en operaciones de larga duracion

### Pendientes produccion (en curso)

| Medida | OWASP | Estado |
|---|---|---|
| Autenticacion JWT + bcrypt (tabla `users`) | A01, A07 | Completado |
| Rate limiting (`express-rate-limit`) | A04 | Pendiente |
| Logging estructurado (tabla `audit_logs`) | A09 | Pendiente |

## Documentacion

- **TSDoc obligatorio** en export publica de `domain/`, `application/`, `infrastructure/`
- `pnpm lint` — verifica TSDoc en exports (eslint-plugin-jsdoc)
- **Solo documentar el "por que"**, no el "que"
- **Tras cada commit**: actualizar `CLAUDE.md` si cambia stack/arquitectura/fases