# Intelligent Automotive Diagnostics

> **TFM — Master IA** · Jesus Novillo · Julio 2026

Aplicacion web que diagnostica averias de vehiculos (coches y motos): se conecta al vehiculo,
real por cable o WiFi o simulado, lee sus codigos de fallo y datos en vivo, y explica que
significan en lenguaje llano con ayuda de una IA — como un mecanico digital. Tiene login y
guarda el historial de diagnosticos de cada usuario.

Por dentro habla con el vehiculo usando el protocolo estandar del sector (OBD-II: SAE J1979,
ISO 15031, ISO 15765-4, ISO 3779), y usa MCP (Model Context Protocol) para poner esa lectura a
disposicion de la IA como herramientas que puede invocar. Backend Express + dashboard React,
Clean Architecture + Hexagonal.

**Demo en vivo**: https://diag.jcodinglabs.com — solo con los 3 vehiculos emulados (no hay
adaptador OBD conectado al servidor); registro propio, sin cuenta de prueba.

## Funcionalidades

- **Diagnostico de un vehiculo real o simulado**: por cable USB o WiFi (adaptador ELM327) o con
  uno de los escenarios simulados (Audi A3 TDI, Kawasaki Z900, Toyota Auris Hybrid)
- **Telemetria en tiempo real**: un gauge por cada PID que soporte el vehiculo conectado (RPM,
  velocidad, temperaturas, presiones, etc.)
- **Identificacion del vehiculo por VIN**: cascada BBDD -> catalogo -> web -> mecanico; si el
  fabricante no se resuelve, se confirma a mano y queda aprendido
- **Codigos de fallo (DTC)**: con severidad, freeze frame, pendientes y permanentes
- **Diagnostico determinista** (reglas sobre el propio protocolo) **y cognitivo** (LLM, si esta
  configurado), con **chat** para preguntar sobre la averia en curso
- **Historial**: sesiones anteriores por usuario, con el informe congelado de cada una
- **Panel admin**: usuarios, logs, auditoria y explorador del catalogo de conocimiento
- **Autenticacion**: login/registro JWT, segundo factor TOTP opcional, recuperacion de
  contrasena por email, perfil

> No hay exportacion a PDF ni busqueda por matricula: el vehiculo se identifica por **VIN**.

## Stack

| Capa | Tecnologia |
|---|---|
| Runtime | Node 22+ (ESM) |
| Lenguaje | TypeScript 5.7+ estricto |
| Framework web | Express 5 + Zod + Helmet |
| IA / Agentes | MCP SDK (`@modelcontextprotocol/sdk`) |
| Persistencia | SQLite + Drizzle ORM |
| Busqueda vectorial | LanceDB (catalogo de conocimiento auto-expansivo) |
| Logger | pino + pino-pretty |
| Tests | Vitest 3 + supertest |
| Package manager | pnpm 10+ |
| Dev tooling | tsx (dev), tsc (build) |
| Documentacion API | Swagger UI + OpenAPI 3.0 |
| CI | GitHub Actions |
| Normativa | SAE J1979, ISO 15031-5, ISO 15765-4 (CAN), ISO 3779 (VIN) |
| OBD Reference | ELM327-emulator v3.0.5 (Python, sidecar Docker) |

## Inicio rapido

Requisitos: Node 22+, pnpm 10+, Docker (para los emuladores; solo hace falta con
`OBD_MODE=docker`, el modo por defecto).

```bash
pnpm install

# 1. Crear el .env en la raiz y rellenar LLM_API_KEY, LLM_BASE_URL y LLM_MODEL
#    (ver "Variables de entorno" abajo). Con LLM_PROVIDER=openai (el de por defecto)
#    los tres son obligatorios: si falta cualquiera, la API no arranca en absoluto.
cp .env.example .env

# 2. Arrancar los emuladores ELM327 (Docker), necesarios con el OBD_MODE=docker
#    por defecto. Sin esto no hay coche (real o simulado) al otro lado y el
#    diagnostico no tiene datos que leer.
docker compose up -d elm327-audi elm327-kawasaki elm327-toyota

# 3. Iniciar backend + frontend
pnpm dev:all
# o por separado:
#   pnpm dev      → backend (http://localhost:4000)
#   pnpm dev:ui   → frontend (http://localhost:5173)
```

`main.ts` carga el `.env` de la raiz del repo automaticamente (`dotenv.config`), sin
depender del directorio desde el que arranques ni de un export manual.

- Dashboard: http://localhost:5173
- Swagger UI: http://localhost:4000/api-docs

### Dashboard UI (apps/ui)

React 19 SPA (Vite + TanStack Router). Funcionalidades detalladas mas arriba; formularios
validados con Zod + react-hook-form.

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
| `/api/auth/2fa/verify` | POST | No | Verifica el codigo TOTP tras el login |
| `/api/profile/2fa/setup` · `/activate` · `/disable` | POST | JWT | Activa/desactiva el segundo factor |
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

Lista completa y comentada en [`.env.example`](.env.example). Las mas relevantes:

```env
OBD_MODE=docker                # docker = 3 emuladores | serial = ELM327 USB | tcp = ELM327 WiFi
ELM327_AUDI_PORT=35000         # docker: un puerto por vehiculo emulado (Audi/Kawasaki/Toyota)
ELM327_KAWASAKI_PORT=35001
ELM327_TOYOTA_PORT=35002
ELM327_HOST=localhost          # solo OBD_MODE=tcp (dongle WiFi real)
ELM327_PORT=35000
SERIAL_PORT_PATH=/dev/ttyUSB0  # solo OBD_MODE=serial — descubrelo con `pnpm obd:probe`
SERIAL_BAUD_RATE=38400
OBD_READ_ONLY=false            # forzado a true en serial/tcp: Mode 04 es irreversible
DB_PATH=data/diagnostics.db
ACCESS_TOKEN_SECRET=changeme
REFRESH_TOKEN_SECRET=changeme
TOTP_ENCRYPTION_KEY=           # cifra el secreto 2FA en BBDD; genera con openssl rand -base64 32
ALLOWED_ORIGINS=http://localhost:5173
LLM_PROVIDER=openai            # anthropic | openai (compatible tambien con DeepSeek, Groq...)
LLM_API_KEY=
LLM_BASE_URL=
LLM_MODEL=
ANTHROPIC_API_KEY=             # solo si LLM_PROVIDER=anthropic
SMTP_HOST=                     # sin configurar, los emails se loguean en consola (dev)
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

## MCP Server — 16 tools

| Categoria | Tools |
|---|---|
| Diagnostico | `read_pid`, `get_dtc_codes`, `get_freeze_frame`, `read_vin`, `get_vehicle_info`, `get_available_pids`, `get_ecu_info` |
| Conocimiento (LanceDB) | `search_similar_pids`, `search_similar_dtcs`, `search_similar_diagnoses`, `search_similar_ecus`, `index_pid`, `index_dtc`, `index_diagnosis`, `index_ecu` |
| Web | `web_search` |

Ejemplos:

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
  -d '{"scenarioId":"audi-a3-tdi","args":{"mode":"01","pid":"0C"}}'
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
pnpm test              # core-api: ~1800 tests
pnpm test:ui           # apps/ui: ~715 tests
pnpm test:all          # ambas apps
pnpm test:watch
pnpm test:coverage     # Features >=80% + Core 100%
pnpm test:e2e          # Playwright, tests/e2e/ (auth, dashboard, logout, 2FA)
```

## Documentacion

- **ADR** — 9 decisiones en `docs/adr/`
- **TSDoc** — export publico con CI (`jsdoc/require-jsdoc`)
- **[AGENTS.md](AGENTS.md)** — Reglas de sesion, agentes, skills, convenciones

## Licencia

Todos los derechos reservados — ver [LICENSE](LICENSE). Repositorio publicado con fines
academicos (TFM): evaluacion del tribunal y consulta publica como evidencia del trabajo,
sin autorizacion de reutilizacion, copia o distribucion.
