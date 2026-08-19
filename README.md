# Intelligent Automotive Diagnostics

> **TFM — Master IA** · Jesus Novillo · Julio 2026
>
> Simulacion de telemetria vehicular y diagnostico con IA mediante el protocolo MCP (Model Context Protocol).
> Clean Architecture + Hexagonal. Cumplimiento SAE J1979 / ISO 15031 / ISO 15765-4 / ISO 3779.

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
| Normativa | SAE J1979, ISO 15031-5, ISO 15765-4 (CAN), ISO 3779 (VIN) |
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

React 19 SPA (Vite + TanStack Router) con dashboard OBD-II profesional:

- **Gauges en tiempo real**: RPM, velocidad, temperatura de refrigerante y admision
- **Selector de vehiculos**: escenarios reales del backend (Audi A3 TDI, Kawasaki Z900, Toyota Auris Hybrid)
- **Wizard de identificacion por VIN**: cascada BBDD -> catalogo -> web -> mecanico; si el fabricante
  no se resuelve, se confirma a mano y queda aprendido
- **Panel DTC**: codigos de fallo con severidad, mas freeze frame, DTC pendientes y permanentes
- **Diagnostico**: determinista via API + cognitivo via LLM (si esta configurado)
- **MechanicChat**: conversacion con el agente sobre el diagnostico en curso
- **Historial**: sesiones anteriores por usuario, con el informe congelado de cada una
- **Panel admin**: usuarios, logs, auditoria y explorador del catalogo de conocimiento
- **Auth JWT**: login/registro, recuperacion de contrasena por email y perfil, con formularios
  validados (Zod + react-hook-form)

> No hay exportacion a PDF ni busqueda por matricula: el vehiculo se identifica por **VIN**.

```bash
cd apps/ui
pnpm dev          # desarrollo (Vite proxy → backend :4000)
pnpm build        # build produccion
pnpm preview      # previsualizar build
```

**Endpoints:**

Lista completa en Swagger UI (`/api-docs`). Resumen por familia:

| Endpoint | Metodo | Auth | Descripcion |
|---|---|---|---|
| `/api-docs` | GET | No | Swagger UI |
| `/health` | GET | No | Health check |
| **Auth** | | | |
| `/api/auth/register` | POST | No | Registro |
| `/api/auth/login` | POST | No | Login (JWT). 5 fallos -> bloqueo 15 min (423) |
| `/api/auth/refresh` | POST | No | Refresh token |
| `/api/auth/logout` | POST | JWT | Revoca el refresh token |
| `/api/auth/me` | GET | JWT | Usuario autenticado |
| `/api/auth/forgot-password` | POST | No | Envia email de reseteo |
| `/api/auth/reset-password` | POST | No | Consume el token de reseteo |
| `/api/profile` | PATCH | JWT | Actualiza perfil y contrasena |
| **Diagnostico** | | | |
| `/api/scenarios` | GET | JWT | Escenarios de simulacion |
| `/api/diagnosis` | POST | JWT | Diagnostico determinista |
| `/api/live-data` | GET | JWT | Lectura de PIDs en vivo |
| `/api/available-pids` | GET | JWT | PIDs soportados por el vehiculo |
| `/api/vehicle-info` · `/api/vehicle-status` | GET | JWT | Identificacion y estado del vehiculo |
| `/api/vehicle-identity` | POST | JWT | Confirmacion manual del fabricante (mecanico) |
| `/api/freeze-frame` | GET | JWT | Datos congelados del fallo (Service 02) |
| `/api/pending-dtc` · `/api/permanent-dtc` | GET | JWT | DTC pendientes (07) y permanentes (0A) |
| `/api/ecu-info` | GET | JWT | ECUs descubiertas en el bus |
| `/api/clear-dtc` | POST | JWT | Borrado de DTC (Service 04) |
| `/api/diagnosis-history` | GET | JWT | Historial paginado del usuario |
| `/api/diagnosis-history/:id` | GET | JWT | Detalle de una sesion (informe congelado) |
| **IA / conocimiento** | | | |
| `/api/mcp/tools/:toolName` | POST | JWT | Invoca una de las 16 tools MCP |
| `/api/mcp/cognitive-diagnosis` | POST | JWT | Diagnostico cognitivo LLM |
| `/api/mcp/capabilities` | GET | JWT | Capacidades disponibles segun configuracion |
| **Admin** (requiere rol `admin`) | | | |
| `/api/admin/overview` · `/users` · `/logs` · `/audit-logs` | GET | JWT | Panel de administracion |
| `/api/admin/knowledge` · `/knowledge/search` | GET · POST | JWT | Catalogo auto-expansivo y busqueda semantica |

## Variables de entorno (`.env`)

```env
OBD_MODE=docker                # docker = emulador | serial = ELM327 USB | tcp = ELM327 WiFi
OBD_READ_ONLY=false            # forzado a true en serial/tcp: Mode 04 es irreversible
ELM327_HOST=localhost          # solo OBD_MODE=tcp
ELM327_PORT=35000
SERIAL_PORT_PATH=/dev/ttyUSB0  # solo OBD_MODE=serial — descubrelo con `pnpm obd:probe`
SERIAL_BAUD_RATE=38400
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
│   │   └── ToolCallHandlerPort.ts
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
