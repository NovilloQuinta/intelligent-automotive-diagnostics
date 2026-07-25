# Intelligent Automotive Diagnostics - TFM

> Vehicular telemetry simulation & AI-powered diagnosis using MCP.
> Master IA - Jesus Novillo | Entrega: 20 julio 2026

## SESION ACTUAL

- **Fase**: 3 — Refactorizacion Clean Architecture + Hexagonal (completada)
- **Ultimo paso**: Verificacion servidor en produccion — arranca OK, 231 tests, lint limpio
- **Tests**: 231 pasando (18 test files)
- **Ficheros creados/modificados** (acumulado Fases 1-3):
  - `domain/vin.ts` (Vin value object ISO 3779)
  - `domain/pidCode.ts` (PidCode value object)
  - `domain/simulationScenario.ts` (movido desde infra)
  - `domain/vehicleProfile.ts` (unifica VehicleInfo + VehicleProfile)
  - `application/ports/authService.interface.ts` (AuthServicePort)
  - `application/ports/refreshTokenStore.interface.ts` (RefreshTokenStorePort)
  - `application/ports/auditLogRepository.interface.ts` (AuditLogRepositoryPort)
  - `application/use-cases/registerUser.ts` (extraido de authController)
  - `application/use-cases/loginUser.ts` (extraido de authController)
  - `application/use-cases/refreshToken.ts` (extraido de authController)
  - `application/use-cases/processVehicleDiagnosis.ts` (movido desde diagnostics/)
  - `infrastructure/http/routes/auth.routes.ts` (fusiona controller + routes)
  - `infrastructure/http/routes/diagnosis.routes.ts` (fusiona controller + routes)
  - `infrastructure/http/middleware/auth.middleware.ts` (renombrado)
  - `infrastructure/http/middleware/audit-logger.middleware.ts` (renombrado)
  - `infrastructure/http/middleware/rate-limiter.middleware.ts` (renombrado)
  - `infrastructure/obd/simulator.ts` (desde hardware-simulator, renombrado)
  - `infrastructure/obd/simulatorAdapter.ts` (desde obdSimulatorRepository)
  - `infrastructure/obd/pidParser.ts` (aplanado desde obd/protocol/)
  - `infrastructure/obd/vinDecoder.ts` (aplanado, logica pura delegada a domain/vin.ts)
  - `infrastructure/services/authService.ts` (movido desde auth/)
  - `infrastructure/mcp/toolCallTrace.ts` (movido desde domain/entities/)
  - `infrastructure/mcp/cognitiveDiagnosisResult.ts` (movido desde domain/entities/)
  - Tests reorganizados para reflejar nueva estructura
  - `CLAUDE.md` (actualizado Fase 3)

## REGLAS DE SESION

1. **Cargar skills necesarios** antes de empezar (ver tabla abajo)
2. **1 paso a la vez** — no mezclar responsabilidades, no adelantar trabajo
3. **TDD estricto**: RED (test que falla) → GREEN (codigo minimo) → REFACTOR
4. **Preguntar antes de commitear/pushear** — mostrar diff, esperar OK humano
5. **Checks pre-commit**: `pnpm lint && pnpm format && pnpm test && pnpm test:coverage && pnpm audit`
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

- **Factory functions**, no clases (ej. `createServer`, `createAuthRoutes`, `createDiagnosisRoutes`)
- **Interface en `application/ports/`**, implementacion en `infrastructure/`
- **Zod** para validar todo input externo (esquemas en use cases, validacion en handlers)
- **Named exports** siempre, nunca `export default`
- **1 fichero = 1 responsabilidad** (KISS, YAGNI, DRY con criterio)
- **Value Objects** en `domain/` encapsulan validacion (Vin, PidCode)
- **Naming convention**: `resource.type.ts` para infraestructura (ej. `auth.routes.ts`, `auth.middleware.ts`)
- **Puertos** con sufijo `Port` (ej. `AuthServicePort`, `RefreshTokenStorePort`)
- **Use cases** como factory functions: `createRegisterUserUseCase(deps)` → `(input) => Promise<Result>`

---

## Stack

- **Runtime**: Node 20+ (ESM) · TypeScript 5.7+ estricto
- **Framework**: Express 5 + Zod + Helmet
- **IA/Agentes**: `@modelcontextprotocol/sdk`
- **Persistencia**: SQLite + Drizzle ORM · (LanceDB: pendiente)
- **Tests**: Vitest 3 + supertest · **Package manager**: pnpm · **Tooling**: tsx (dev), tsc (build)
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
pnpm test:coverage                      # coverage (Features >=80% + Core 100%, via vitest thresholds)
```

## Arquitectura (Clean Architecture + Hexagonal)

```
apps/core-api/src/
├── main.ts                          # Composition root + entry point (Express :4000)
│
├── domain/                          # Capa interna: entidades + value objects
│   ├── vin.ts                       #   Vin (ISO 3779 value object)
│   ├── pidCode.ts                   #   PidCode (value object)
│   ├── simulationScenario.ts        #   SimulationScenario + VehicleType
│   ├── vehicleProfile.ts            #   VehicleInfo + VehicleProfile
│   ├── liveData.ts                  #   LiveData + AbsStatus
│   ├── dtcCode.ts                   #   DtcCode
│   ├── freezeFrame.ts               #   FreezeFrame
│   ├── diagnosisResult.ts           #   DiagnosisResult + Severity
│   ├── diagnosisSession.ts          #   DiagnosisSession
│   ├── ecuInfo.ts                   #   EcuInfo + EcuType
│   ├── pidDefinition.ts             #   PidDefinition + PidReading
│   └── user.ts                      #   User + CreateUserInput
│
├── application/                     # Capa intermedia: puertos + casos de uso
│   ├── ports/                       #   Contratos (interfaces puras)
│   │   ├── obdRepository.interface.ts
│   │   ├── vehicleRepository.interface.ts
│   │   ├── userRepository.interface.ts
│   │   ├── authService.interface.ts
│   │   ├── refreshTokenStore.interface.ts
│   │   └── auditLogRepository.interface.ts
│   └── use-cases/                   #   Orquestacion de negocio
│       ├── processVehicleDiagnosis.ts
│       ├── registerUser.ts
│       ├── loginUser.ts
│       └── refreshToken.ts
│
└── infrastructure/                  # Capa externa: adaptadores concretos
    ├── http/                        #   Express (primary adapters)
    │   ├── routes/
    │   │   ├── auth.routes.ts
    │   │   └── diagnosis.routes.ts
    │   ├── middleware/
    │   │   ├── auth.middleware.ts
    │   │   ├── audit-logger.middleware.ts
    │   │   └── rate-limiter.middleware.ts
    │   ├── server.ts
    │   └── swagger.ts
    ├── services/                    #   Servicios transversales
    │   └── authService.ts           #     JWT + bcrypt + refresh token rotation
    ├── obd/                         #   Hardware OBD-II (simulador + futuro ELM327)
    │   ├── simulator.ts
    │   ├── simulatorAdapter.ts
    │   ├── pidParser.ts
    │   └── vinDecoder.ts
    ├── mcp/                         #   MCP tools para agentes IA
    │   ├── mcpServer.ts
    │   ├── cognitiveDiagnosisResult.ts
    │   └── toolCallTrace.ts
    └── persistence/                 #   Base de datos (secondary adapters)
        └── sqlite/
            ├── schema.ts            #     Drizzle ORM (8 tablas)
            ├── db.ts
            ├── userRepository.ts
            ├── vehicleRepository.ts
            ├── refreshTokenStore.ts
            ├── auditLogRepository.ts
            └── seed-pids.ts
```

### Dependencias entre capas (inviolable)

```
domain ← application ← infrastructure
   ↑          ↑             ↑
   └── imports flow this way ──┘
```

- `domain/` — 0 imports desde capas superiores
- `application/` — importa `domain/`, NUNCA `infrastructure/`
- `infrastructure/` — importa `domain/` y `application/`
- `main.ts` — composition root: instancia adaptadores y los inyecta

## Estado del proyecto

| Fase | Estado |
|---|---|
| Fase 1 — Express API + ELM327-emulator Docker | Completada |
| Fase 2a — SQLite/Drizzle + PidParser + catalogo + API tests | Completada |
| Hardening OWASP A01-A08 (helmet, CORS, Zod, timeout, CI) | Completado |
| Fase 2b — Hardening produccion (AUTH + RATE + LOG) | Completada |
| Fase 3 — Refactorizacion Clean Architecture + Hexagonal | **Completada** |
| Pendiente — LanceDB + LLM + TCP OBD + docs finales | Sin empezar |

## Seguridad

### No regresiones (inviolable)

- **Nunca** cambiar CORS de vuelta a `*`
- **Nunca** quitar `helmet()` del pipeline
- **Nunca** desactivar el error handler global o exponer stack traces
- **Nunca** usar `req.body` sin validar con Zod en nuevos endpoints
- **Siempre** timeout en operaciones de larga duracion

### Medidas implementadas

| Medida | OWASP | Estado |
|---|---|---|
| Autenticacion JWT + bcrypt (tabla `users`) | A01, A07 | Completado |
| Rate limiting (`express-rate-limit`) | A04 | Completado |
| Logging estructurado (tabla `audit_logs`) | A09 | Completado |
| Helmet + CORS restrictivo | A05, A06 | Completado |
| Zod validation en todos los endpoints | A03 | Completado |

## Documentacion

- **TSDoc obligatorio** en export publica de `domain/`, `application/`, `infrastructure/`
- `pnpm lint` — verifica TSDoc en exports (eslint-plugin-jsdoc)
- **Solo documentar el "por que"**, no el "que"
- **Tras cada commit**: actualizar `CLAUDE.md` si cambia stack/arquitectura/fases
