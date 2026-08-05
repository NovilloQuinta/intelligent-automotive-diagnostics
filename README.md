# Intelligent Automotive Diagnostics

> **TFM — Master IA** · Jesus Novillo · Julio 2026
>
> Simulacion de telemetria vehicular y diagnostico con IA mediante el protocolo MCP (Model Context Protocol).
> Clean Architecture + Hexagonal. Cumplimiento SAE J1979 / ISO 15031 / ISO 3779.

## Stack

| Capa | Tecnologia |
|---|---|
| Runtime | Node 22+ (ESM) |
| Lenguaje | TypeScript 5.7+ estricto |
| Framework web | Express 5 + Zod + Helmet |
| IA / Agentes | MCP SDK (`@modelcontextprotocol/sdk`) |
| Persistencia | SQLite + Drizzle ORM |
| Logger | pino + pino-pretty |
| Tests | Vitest 3 + supertest |
| Package manager | pnpm 10+ |
| Dev tooling | tsx (dev), tsc (build) |
| Documentacion API | Swagger UI + OpenAPI 3.0 |
| CI | GitHub Actions |
| Normativa | SAE J1979, ISO 15031-5, ISO 3779 (VIN) |
| OBD Reference | ELM327-emulator v3.0.5 (Python, sidecar Docker) |

## Inicio rapido

```bash
pnpm install

# 2. Iniciar backend + frontend
pnpm dev:all
# o por separado:
#   pnpm dev      → backend (http://localhost:4000)
#   pnpm dev:ui   → frontend (http://localhost:5173)

# 3. Dashboard: http://localhost:5173
#    Swagger UI: http://localhost:4000/api-docs
```

### Dashboard UI (apps/ui)

React 19 SPA con dashboard OBD-II profesional:

- **Gauges en tiempo real**: RPM, velocidad, temperatura de refrigerante y admision
- **Selector de vehiculos**: escenarios reales del backend (Audi A3, Kawasaki Z900)
- **Panel DTC**: codigos de fallo con severidad
- **Diagnostico**: determinista via API + cognitivo via LLM (si esta configurado)
- **Auth JWT**: login/registro con formularios validados (Zod + react-hook-form)

```bash
cd apps/ui
pnpm dev          # desarrollo (Vite proxy → backend :4000)
pnpm build        # build produccion
pnpm preview      # previsualizar build
```

**Endpoints:**

| Endpoint | Metodo | Auth | Descripcion |
|---|---|---|---|
| `/api-docs` | GET | No | Swagger UI |
| `/health` | GET | No | Health check |
| `/api/auth/register` | POST | No | Registro |
| `/api/auth/login` | POST | No | Login (JWT) |
| `/api/auth/refresh` | POST | No | Refresh token |
| `/api/scenarios` | GET | JWT | Escenarios de simulacion |
| `/api/diagnosis` | POST | JWT | Diagnostico determinista |
| `/api/mcp/tools/:toolName` | POST | JWT | Tool MCP |
| `/api/mcp/cognitive-diagnosis` | POST | JWT | Diagnostico cognitivo LLM |

## Variables de entorno (`.env`)

```env
OBD_MODE=sync                  # sync = simulador | tcp = emulador
ELM327_HOST=localhost
ELM327_PORT=35000
DB_PATH=data/diagnostics.db
ACCESS_TOKEN_SECRET=
REFRESH_TOKEN_SECRET=
ALLOWED_ORIGINS=http://localhost:5173
LLM_PROVIDER=openai            # anthropic | openai
LLM_API_KEY=
LLM_BASE_URL=
LLM_MODEL=
ANTHROPIC_API_KEY=
```

## Arquitectura

**Clean Architecture + Hexagonal (Ports & Adapters)** con dependencia unidireccional:

```
domain ← application ← infrastructure
```

[ADR 001](docs/adr/001-arquitectura-del-sistema.md) — justificacion completa.

```
apps/core-api/src/
├── main.ts                     ← Entry point (10 lineas: loadConfig, buildApp, listen)
│
├── domain/
│   ├── entities/               ← Entidades con id: number obligatorio
│   │   ├── User.ts
│   │   ├── DiagnosisSession.ts
│   │   ├── VehicleProfile.ts
│   │   ├── EcuInfo.ts
│   │   ├── PidDefinition.ts
│   │   └── PidReading.ts
│   ├── value-objects/          ← VOs inmutables, constructor publico + validacion
│   │   ├── Vin.ts, Email.ts
│   │   ├── PidCode.ts, DtcCode.ts
│   │   ├── FreezeFrame.ts, LiveData.ts
│   │   ├── DiagnosisResult.ts, VehicleInfo.ts
│   │   └── (errores co-localizados con su VO)
│   └── pids.ts                 ← Constantes SAE J1979
│
├── application/
│   ├── ports/                  ← Contratos (interfaces puras)
│   │   ├── UserRepository.ts, ObdRepository.ts
│   │   ├── LlmClientPort.ts, AuthServicePort.ts
│   │   ├── LoggerPort.ts, AuditLogRepository.ts
│   │   ├── RefreshTokenRepository.ts, VehicleRepository.ts
│   │   └── ToolCallHandler.ts
│   ├── use-cases/              ← Clases con execute()
│   │   ├── RegisterUserUseCase.ts
│   │   ├── LoginUserUseCase.ts
│   │   ├── RefreshTokenUseCase.ts
│   │   ├── ProcessVehicleDiagnosisUseCase.ts
│   │   └── ExecuteCognitiveDiagnosisUseCase.ts
│   ├── dto/                    ← 1 fichero por DTO (Input/Output)
│   ├── llm/                    ← Anti-corruption parser LLM
│   └── shared/                 ← hashToken.ts
│
└── infrastructure/
    ├── composition/            ← Composition Root (buildApp)
    │   └── composition.ts
    ├── configuration/          ← Validacion env vars (Zod)
    │   └── index.ts
    ├── http/
    │   ├── controllers/        ← AuthController, DiagnosisController
    │   ├── routes/             ← Solo endpoints
    │   ├── middleware/         ← Auth, rate-limit, audit
    │   ├── server.ts           ← Factory Express
    │   └── swagger.ts
    ├── observability/          ← Logger (pino + SQLite)
    │   └── logger.ts
    ├── persistence/
    │   ├── sqlite/             ← Repositorios Drizzle + schema
    │   └── mappers/            ← Row ↔ Entity mapping
    ├── llm/                    ← Adaptadores Anthropic/OpenAI
    ├── mcp/                    ← Servidor MCP in-process
    ├── simulation/             ← Simulador + escenarios seed
    ├── elm327/                 ← Adaptador TCP ELM327
    └── services/               ← AuthService (bcrypt + JWT)
```

### Convenciones de naming

| Elemento | Convencion | Ejemplo |
|---|---|---|
| Entidad | `Noun.ts` | `User.ts` |
| Value Object | `Noun.ts` | `Vin.ts` |
| Puerto (repo) | `EntityRepository.ts` | `UserRepository.ts` |
| Puerto (servicio) | `ServicePort.ts` | `LlmClientPort.ts` |
| Use case | `VerbNounUseCase.ts` | `RegisterUserUseCase.ts` |
| DTO | `VerbNounInput/Output.ts` | `RegisterUserInput.ts` |
| Controller | `NounController.ts` | `AuthController.ts` |

## MCP Server — 6 tools

| Tool | Ejemplo |
|---|---|
| `read_pid(mode, pid)` | `read_pid("01", "0C")` → `"750"` |
| `get_dtc_codes()` | → `"P0301"` |
| `get_freeze_frame(dtc?)` | → valores congelados |
| `read_vin()` | → `"WAUZZZ8V5JA123456"` |
| `get_vehicle_info()` | → `"Audi A3 (2018) — 2.0 TFSI"` |
| `get_available_pids(vehicleId?)` | → PIDs conocidos |

```bash
curl -X POST http://localhost:4000/api/mcp/tools/read_pid \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"scenarioId":"audi-a3-idle","args":{"mode":"01","pid":"0C"}}'
```

## Seguridad

| Medida | OWASP |
|---|---|
| JWT + bcrypt | A01, A07 |
| Rate limiting | A04 |
| Helmet + CORS | A05, A06 |
| Zod validation | A03 |
| Auditoria HTTP (`audit_logs`) | A09 |
| Logging estructurado (pino + `logs`) | A09 |

## Testing

```bash
pnpm test              # 432 tests en 33 suites
pnpm test:watch
pnpm test:coverage
```

## Documentacion

- **ADR** — 8 decisiones en `docs/adr/`
- **TSDoc** — export publico con CI (`jsdoc/require-jsdoc`)
- **[AGENTS.md](AGENTS.md)** — Reglas de sesion, agentes, skills, convenciones
