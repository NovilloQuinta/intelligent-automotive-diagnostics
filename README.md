# Intelligent Automotive Diagnostics

> **TFM — Master IA** · Jesus Novillo · Julio 2026
>
> Simulacion de telemetria vehicular y diagnostico con IA mediante el protocolo MCP (Model Context Protocol).
> Catalogo de PIDs auto-expansivo asistido por LLM. Cumplimiento SAE J1979 / ISO 15031 / ISO 3779.

## Stack

| Capa | Tecnologia |
|---|---|
| Runtime | Node 20+ (ESM) |
| Lenguaje | TypeScript 5.7+ estricto |
| Framework web | Express 5 + Zod + Helmet |
| IA / Agentes | MCP SDK (`@modelcontextprotocol/sdk`) |
| Persistencia | SQLite + Drizzle ORM |
| Vectorial | LanceDB (pendiente) |
| Tests | Vitest 3 + supertest |
| Package manager | pnpm 10 |
| Dev tooling | tsx (dev), tsc (build) |
| Documentacion API | Swagger UI + OpenAPI 3.0 |
| CI | GitHub Actions |
| Normativa | SAE J1979, ISO 15031-5, ISO 3779 (VIN) |
| OBD Reference | ELM327-emulator v3.0.5 (Python, sidecar Docker) |

## Inicio rapido

```bash
# 1. Instalar dependencias
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

**Disponible en `http://localhost:4000`:**

| Endpoint | Metodo | Auth | Descripcion |
|---|---|---|---|
| `/api-docs` | GET | No | Swagger UI interactivo |
| `/health` | GET | No | Health check |
| `/api/auth/register` | POST | No | Registro de usuario |
| `/api/auth/login` | POST | No | Inicio de sesion (JWT) |
| `/api/auth/refresh` | POST | No | Rotacion de refresh token |
| `/api/scenarios` | GET | JWT | Lista de escenarios de simulacion |
| `/api/diagnosis` | POST | JWT | Diagnostico determinista |
| `/api/mcp/tools/:toolName` | POST | JWT | Invocar tool MCP |
| `/api/mcp/cognitive-diagnosis` | POST | JWT | Diagnostico cognitivo LLM via MCP |

### Prerrequisitos

- **Node.js** 20+ (LTS)
- **pnpm** 10+
- **Docker Desktop** (opcional, solo para el emulador ELM327)

### Variables de entorno (`.env`)

```env
OBD_MODE=sync                  # sync = simulador interno | tcp = emulador real
ELM327_HOST=localhost          # Host del emulador ELM327
ELM327_PORT=35000              # Puerto del emulador
DB_PATH=data/diagnostics.db    # Ruta de la BD SQLite
ACCESS_TOKEN_SECRET=           # Secreto para firmar JWT access tokens
REFRESH_TOKEN_SECRET=          # Secreto para firmar JWT refresh tokens
LLM_PROVIDER=openai            # Proveedor LLM: anthropic | openai
LLM_API_KEY=                   # API key del proveedor LLM
LLM_BASE_URL=                  # URL base (openai-compatible)
LLM_MODEL=                     # Modelo (por defecto gpt-4o)
ANTHROPIC_API_KEY=             # Solo si LLM_PROVIDER=anthropic
```

## Arquitectura

**Clean Architecture + Hexagonal (Ports & Adapters)** con dependencia unidireccional:

```
domain ← application ← infrastructure
   ↑          ↑             ↑
   └── imports flow this way ──┘
```

[ADR 001](docs/adr/001-arquitectura-del-sistema.md) — justificacion completa.

```
apps/core-api/src/
├── main.ts                          # Composition root + entry point
│
├── domain/                          # Capa interna: value objects + entidades
│   ├── vin.ts                       #   Vin value object (ISO 3779)
│   ├── pidCode.ts                   #   PidCode value object
│   ├── pids.ts                       #   Catalogo de PIDs SAE J1979
│   ├── simulationScenario.ts        #   SimulationScenario + VehicleType
│   ├── vehicleProfile.ts            #   VehicleInfo + VehicleProfile
│   ├── liveData.ts, dtcCode.ts, freezeFrame.ts
│   ├── diagnosisResult.ts, diagnosisSession.ts
│   ├── ecuInfo.ts, pidDefinition.ts, user.ts
│
├── application/                     # Capa intermedia: puertos + casos de uso
│   ├── ports/                       #   Contratos (7 interfaces)
│   │   ├── obdRepository.interface.ts
│   │   ├── userRepository.interface.ts
│   │   ├── vehicleRepository.interface.ts
│   │   ├── llmClient.interface.ts
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
    │   ├── routes/                  #     auth.routes.ts, diagnosis.routes.ts
    │   ├── middleware/              #     auth.middleware.ts, rate-limiter.middleware.ts...
    │   ├── server.ts, swagger.ts
    ├── services/                    #   Servicios transversales
    │   └── authService.ts           #     JWT + bcrypt + refresh token rotation
    ├── llm/                          #   Adaptadores LLM (Anthropic + OpenAI)
    │   ├── anthropicClient.ts, openAiClient.ts
    │   ├── mcpToolAdapter.ts, openAiToolAdapter.ts
    │   ├── toolDefinitionSchema.ts, sdkErrorUtils.ts
    ├── obd/                         #   Hardware OBD-II (simulador + parsers)
    │   ├── simulator.ts, simulatorAdapter.ts
    │   ├── pidParser.ts, vinDecoder.ts
    ├── mcp/                         #   MCP tools para agentes IA
    │   └── mcpServer.ts, toolCallTrace.ts, cognitiveDiagnosisResult.ts
    └── persistence/                 #   Base de datos (secondary adapters)
        └── sqlite/
            ├── schema.ts, db.ts, seed-pids.ts
            └── ...repositories (4)
```

## Casos de uso

| Caso de uso | Ubicacion | Estado |
|---|---|---|
| **ProcessVehicleDiagnosis** | `application/use-cases/processVehicleDiagnosis.ts` | Implementado |
| **RegisterUser** | `application/use-cases/registerUser.ts` | Implementado |
| **LoginUser** | `application/use-cases/loginUser.ts` | Implementado |
| **RefreshToken** | `application/use-cases/refreshToken.ts` | Implementado |
| **ExecuteCognitiveDiagnosis** | `application/use-cases/` | Pendiente |
| **DiscoverVehicle** | `application/use-cases/` | Pendiente |

## MCP Server — 6 tools

| Tool | Fuente | Ejemplo |
|---|---|---|
| `read_pid(mode, pid)` | ObdRepository (Service 01) | `read_pid("01", "0C")` → `"750"` |
| `get_dtc_codes()` | ObdRepository (Service 03) | `get_dtc_codes()` → `"P0301"` |
| `get_freeze_frame(dtc?)` | ObdRepository (Service 02) | `get_freeze_frame("P0301")` → valores congelados |
| `read_vin()` | ObdRepository (Service 09) | `read_vin()` → `"WAUZZZ8V5JA123456"` |
| `get_vehicle_info()` | ObdRepository | `get_vehicle_info()` → `"Audi A3 (2018) — 2.0 TFSI"` |
| `get_available_pids(vehicleId?)` | VehicleRepository | Lista de PIDs conocidos |

```bash
curl -X POST http://localhost:4000/api/mcp/tools/read_pid \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"scenarioId":"audi-a3-idle","args":{"mode":"01","pid":"0C"}}'
```

## Seguridad

| Medida | OWASP | Estado |
|---|---|---|
| Autenticacion JWT + bcrypt | A01, A07 | Completado |
| Rate limiting (express-rate-limit) | A04 | Completado |
| Logging estructurado (audit_logs) | A09 | Completado |
| Helmet + CORS restrictivo | A05, A06 | Completado |
| Zod validation en todos los endpoints | A03 | Completado |

## Testing

```bash
pnpm test            # 257 tests en 22 suites
pnpm test:watch      # Modo watch TDD
pnpm test:coverage   # Cobertura
```

| Suite | Tests | Capa |
|---|---|---|
| `pidParser.test.ts` | 44 | Parser Shunting-yard |
| `vin.test.ts` | 24 | Value object VIN (ISO 3779) |
| `server.test.ts` | 20 | Integracion HTTP + MCP |
| `authService.test.ts` | 20 | JWT + bcrypt |
| `pidCode.test.ts` | 14 | Value object PidCode |
| `auth.integration.test.ts` | 12 | Auth end-to-end |
| `mcpServer.test.ts` | 11 | 6 tools + edge cases |
| `simulator.test.ts` | 11 | Codificacion/decodificacion |
| `auth.routes.test.ts` | 10 | Auth endpoints |
| `anthropicClient.test.ts` | 9 | Adaptador LLM Anthropic |
| `vehicleRepository.test.ts` | 17 | CRUD + validacion VIN |
| `userRepository.test.ts` | 9 | CRUD usuarios |
| `processVehicleDiagnosis.test.ts` | 7 | readPid + freeze frame + severidad |
| `openAiClient.test.ts` | 16 | Adaptador LLM OpenAI |
| `authMiddleware.test.ts` | 5 | JWT verification |
| `auditLogRepository.test.ts` | 5 | Auditoria |
| `rateLimiter.test.ts` | 4 | Rate limiting |
| `mcpToolAdapter.test.ts` | 4 | Adapter Anthropic tools → JSON Schema |
| `openAiToolAdapter.test.ts` | 4 | Adapter OpenAI tools → JSON Schema |
| `diagnosis.routes.test.ts` | 4 | Diagnosis endpoints |
| `vinDecoder.test.ts` | 4 | VIN: decode, validate, check digit, WMI |
| `auditLogger.test.ts` | 3 | HTTP logging |

## Fases del proyecto

| Fase | Estado | Tests |
|---|---|---|
| Fase 1 — Express API + ELM327 Docker | Completada | — |
| Fase 2a — SQLite/Drizzle + PidParser + catalogo | Completada | — |
| Hardening OWASP A01-A08 | Completado | — |
| Fase 2b — Hardening produccion (AUTH + RATE + LOG) | Completada | — |
| **Fase 3 — Refactorizacion Clean Architecture + Hexagonal** | **Completada** | **257** |
| **Fase 4 — Diagnostico Cognitivo LLM via MCP** | **En progreso** | **257** |
| Pendiente — LanceDB + TCP OBD | Sin empezar | — |

## Documentacion

- **ADR** — 6 decisiones arquitectonicas en `docs/adr/`
- **TSDoc** — export publico en `domain/`, `application/`, `infrastructure/`
- **CI Docs** — verificacion en pipeline (`pnpm lint` incluye TSDoc)
- **[CLAUDE.md](CLAUDE.md)** — Reglas del proyecto, skills, convenciones
