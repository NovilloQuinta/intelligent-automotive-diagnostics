# Intelligent Automotive Diagnostics - TFM

> Vehicular telemetry simulation & AI-powered diagnosis using Model Context Protocol (MCP).
> Master IA - Jesus Novillo
> Entrega: 20 julio 2026

## Stack

- **Runtime**: Node 20+ (ESM)
- **Lenguaje**: TypeScript 5.7+ estricto
- **Framework web**: Express 5 + Zod + Helmet (seguridad HTTP)
- **IA/Agentes**: MCP SDK (`@modelcontextprotocol/sdk`)
- **Persistencia**: SQLite + Drizzle ORM (catalogo auto-expansivo de PIDs)
- **Vectorial**: LanceDB (busqueda semantica de PIDs, Fase 2b)
- **Tests**: Vitest 3
- **Package manager**: pnpm
- **Tooling**: tsx (dev), tsc (build)
- **Contenedores**: Docker + Docker Compose
- **OBD Reference**: ELM327-emulator v3.0.5 (Python 3.11, sidecar de testing)
- **Normativa**: SAE J1979 (services 01-04, 09), ISO 15031-5, ISO 3779 (VIN)

## Servicios Docker

| Servicio | Puerto | Descripcion |
|---|---|---|
| `elm327` | 35000 | ELM327-emulator con escenario Toyota Auris Hybrid |

```bash
docker compose up -d elm327    # arrancar emulador
docker compose logs elm327      # ver actividad
docker compose down elm327      # parar
```

## Scripts OBD (raiz)

```bash
pnpm tsx scripts/send-obd.ts "01 0C"    # enviar comando OBD al emulador
pnpm tsx scripts/scan-pids.ts           # escanear PIDs soportados
```

## Scripts DB (apps/core-api)

```bash
pnpm drizzle-kit generate               # generar migraciones desde schema.ts
pnpm drizzle-kit migrate                # aplicar migraciones a SQLite
```

## Base de datos (SQLite + Drizzle)

La BD se crea automaticamente en `data/diagnostics.db` al iniciar la API.
En tests se usa `:memory:` (sin archivo).

## Arquitectura (Clean Architecture + MCP)

```
apps/core-api/src/
├── domain/entities/             # Capa 1: Entidades puras
├── application/                 # Capa 2: Puertos + Casos de uso
│   ├── ports/                   # obdRepository, vehicleRepository
│   └── diagnostics/             # processVehicleDiagnosis (core del sistema)
├── infrastructure/              # Capa 3: Adaptadores tecnicos
│   ├── hardware-simulator/      # obdSimulator, simulationScenario
│   ├── obd/protocol/            # pidParser (Shunting-yard, SAE J1979)
│   ├── http/                    # server.ts (Express), controllers/
│   ├── persistence/sqlite/      # schema, db, vehicleRepository
│   ├── persistence/vector/      # LanceDB (Fase 2b)
│   └── mcp/                     # mcpServer.ts (Fase 2b)
└── main.ts                      # Composition root (Express :4000)
```

## Tests

```bash
pnpm test           # vitest run (99 tests)
pnpm test:watch     # vitest watch
pnpm test:coverage  # vitest run --coverage
```

### Testing guidelines

- Mock **solo** en infraestructura: `ObdRepository`, HTTP, file system
- **Nunca** mockear entidades de dominio ni funciones puras (parser, validators)
- Coverage: `application/** >=90%`, `infrastructure/** >=80%`, `domain/**` excluido

## CI (GitHub Actions)

Push a `main` y PRs ejecutan `pnpm install --frozen-lockfile` + `pnpm lint` + `pnpm test` + `pnpm audit` en Node 22 + pnpm 10.

```yaml
.github/workflows/ci.yml
```

## Estado del proyecto

- **Fase 1**: Completada - Express API, ELM327-emulator en Docker
- **Fase 2a**: Completada - SQLite/Drizzle + PidParser + catalogo + API tests
- **Hardening OWASP Top 10**: Completado - helmet, CORS, body limit, error handler, Zod, timeout, CI (91 tests)
- **Fase 2b** (siguiente): MCP Server + LanceDB + diagnostico cognitivo (LLM)
- **Fase 3**: streaming, cambio de escenarios, README final
- **Pendiente produccion**: autenticacion JWT + bcrypt, rate limiting, logging estructurado

> Detalle completo en `docs/fase-2-plan-v2.md`

## Convenciones

- **Commits**: imperativo, espanol, <72 chars, prefijos `feat:` / `fix:` / `test:` / `docs:`
- **Imports**: ES modules (`import/export`), named exports siempre
- **Tipado**: estricto, evitar `any`
- **Comentarios**: solo el "porque" no obvio
- **Estructura**: 1 fichero = 1 responsabilidad
- **KISS**: solve the problem at hand, don't abstract for hypothetical futures
- **DRY**: extract duplication into shared constants/utilities, but avoid premature abstraction
- **YAGNI**: don't write code you don't need yet - no generic interfaces "just in case"

## Seguridad (OWASP Top 10)

### Hardening aplicado

| Medida | Archivo | OWASP |
|---|---|---|
| `helmet()` - cabeceras de seguridad HTTP | `server.ts` | A05 |
| CORS restringido a `localhost` (nunca `*`) | `server.ts` | A01 |
| Body limit `10kb` (`express.json({ limit })`) | `server.ts` | A04 |
| Error handler global (sin leak de stack traces) | `server.ts` | A05 |
| Swagger solo en `NODE_ENV !== 'production'` | `server.ts` | A05 |
| Validacion de `req.body` con Zod (`safeParse`) | `diagnosisController.ts` | A03 |
| Timeout de 10s en diagnostico (`Promise.race`) | `processVehicleDiagnosis.ts` | A04 |
| `esbuild >=0.25.0` (pnpm overrides) | `package.json` | A06 |
| `pnpm install --frozen-lockfile` en CI | `.github/workflows/ci.yml` | A08 |
| `pnpm audit` en CI | `.github/workflows/ci.yml` | A06 |

### Checks de seguridad

```bash
pnpm lint         # eslint + typescript-eslint
pnpm test         # vitest (91 tests, todos deben pasar)
pnpm audit        # 0 vulnerabilidades conocidas
```

### No regresiones

- **Nunca** cambiar CORS de vuelta a `*`
- **Nunca** quitar `helmet()` del pipeline
- **Nunca** desactivar el error handler global o exponer stack traces
- **Nunca** usar `req.body` sin validar con Zod en nuevos endpoints
- **Siempre** timeout en operaciones asincronas de larga duracion

### Pendientes produccion

| Medida | OWASP |
|---|---|
| Autenticacion JWT + bcrypt | A01, A07 |
| Rate limiting (`express-rate-limit`) | A04 |
| Logging estructurado (tabla `audit_logs`) | A09 |

## Documentacion

- **TSDoc obligatorio** en toda export publica de `domain/`, `application/` e `infrastructure/`
- **ADR** en `docs/adr/` para decisiones arquitectonicas (formato Michael Nygard) — 6 ADRs incluyendo 006-compliance-sae-j1979
- `pnpm lint:docs` - verifica TSDoc en exports
- **Solo documentar el "por que"**, no el "que"
- Tras cada commit: actualizar `CLAUDE.md` si cambia stack/arquitectura/fases; `docs/fase-2-plan-v2.md` si avanza un paso

## Skills (incluidas en el proyecto)

Cargar con `skill` tool al inicio de cada fase de desarrollo.

| Skill | Path | Cuando cargar |
|---|---|---|
| `clean-architecture` | `.opencode/skills/clean-architecture/` | Antes de crear/mover ficheros entre capas |
| `typescript-best-practices` | `.opencode/skills/typescript-best-practices/` | Al escribir o revisar TypeScript |
| `tdd-workflow` | `.opencode/skills/tdd-workflow/` | Antes de escribir tests o ciclo Red-Green-Refactor |
| `tsdoc-jsdoc-documentation` | `.opencode/skills/tsdoc-jsdoc-documentation/` | Antes de crear o revisar TSDoc en exports publicos |

## Reglas de sesion

1. **Cargar skills** al inicio de cada fase
2. **Preguntar antes de commitear/pushear** - mostrar diff, esperar OK humano
3. **1 paso a la vez** - no mezclar varias responsabilidades en una tanda
4. **Leer CLAUDE.md como checklist al arrancar sesion**
5. **Checks pre-commit**: `pnpm lint`, `pnpm test`, `pnpm audit` - todo debe pasar antes de commitear
6. **Actualizar documentacion tras cada commit**:
   - `CLAUDE.md` -> si cambia stack, arquitectura, estado de fases, o scripts
   - `docs/fase-2-plan-v2.md` -> si se completa/avanza un paso del plan
   - ADR en `docs/adr/` -> si hay decision arquitectonica nueva
   - `README.md` -> si cambia quick start o dependencias
