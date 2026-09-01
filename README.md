# Intelligent Automotive Diagnostics

> **TFM — Master IA** · Jesus Novillo · Julio 2026
>
> Simulacion de telemetria vehicular y diagnostico con IA mediante el protocolo MCP (Model Context Protocol).
> Clean Architecture + Hexagonal. Cumplimiento SAE J1979 / ISO 15031 / ISO 15765-4 / ISO 3779.

## Entrega del TFM

| Recurso | Enlace |
|---|---|
| **Aplicacion desplegada** | **https://diag.jcodinglabs.com** |
| Documentacion de API (Swagger) | https://diag.jcodinglabs.com/api-docs |
| Presentacion (slides) | [`docs/presentacion/`](docs/presentacion/) — _URL publica pendiente_ |
| Video de presentacion | _pendiente de publicar_ |
| Checklist de entrega | [`docs/entrega-tfm.md`](docs/entrega-tfm.md) |

### Acceso de prueba

La aplicacion tiene login. Para probarla sin registrarse:

| Campo | Valor |
|---|---|
| Email | _pendiente de fijar_ |
| Contrasena | _pendiente de fijar_ |

Tambien se puede crear una cuenta nueva desde **Registro**: el alta esta abierta y da
acceso a todo el flujo de diagnostico.

> El **panel de administracion** (`/admin`) es aparte: requiere rol `admin` **y** segundo
> factor TOTP activo — sin el, `/api/admin` responde 403 aunque el rol sea correcto. El
> primer admin se siembra al arrancar con `ADMIN_EMAIL`/`ADMIN_PASSWORD` en el `.env`.

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

# 1. Crear el .env en la raiz y rellenar LLM_API_KEY, LLM_BASE_URL y LLM_MODEL
#    (ver "Variables de entorno" abajo). Con LLM_PROVIDER=openai (el de por defecto)
#    los tres son obligatorios: si falta cualquiera, la API no arranca en absoluto.
cp .env.example .env

# 2. Iniciar backend + frontend
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

### Estructura del monorepo

```
.
├── apps/
│   ├── core-api/          ← Backend Express 5 + MCP + SQLite (Clean Architecture)
│   └── ui/                ← Frontend React 19 + Vite + TanStack Router
│       └── src/           ← components/ hooks/ lib/ routes/
├── docs/
│   ├── adr/               ← 9 decisiones de arquitectura
│   ├── tfm/               ← Documentacion tecnica de la defensa (6 documentos)
│   ├── infrastructure/    ← Despliegue y emulador ELM327
│   ├── entrega-tfm.md     ← Checklist de entrega del TFM
│   ├── guion-video.md     ← Guion del video de presentacion
│   └── guion-demo.md      ← Guion de la demo, pantalla a pantalla
├── docker/                ← Emuladores ELM327 (Audi, Kawasaki, Toyota)
├── openspec/              ← Especificaciones de cambios (propuesta antes de codigo)
├── scripts/               ← Sondas OBD y bateria de evaluacion del agente
├── docker-compose.yml     ← Desarrollo (3 emuladores)
├── docker-compose.prod.yml← Produccion (API + UI + emuladores, solo loopback)
└── Caddyfile              ← Reverse proxy con TLS del despliegue
```

### Backend — `apps/core-api/`

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

El LLM no toca el coche ni la base de datos: pide **tools**, y el servidor MCP decide si
las ejecuta. Detalle completo en [`docs/tfm/01-mcp.md`](docs/tfm/01-mcp.md).

**Diagnostico OBD-II (7)**

| Tool | Ejemplo |
|---|---|
| `read_pid(mode, pid)` | `read_pid("01", "0C")` → `"750"` |
| `get_dtc_codes()` | → `"P0301: Cylinder 1 Misfire"` |
| `get_freeze_frame(dtc?)` | → valores congelados (Service 02) |
| `read_vin()` | → `"WAUZZZ8V5JA123456"` |
| `get_vehicle_info()` | → `"Audi A3 (2018) — 2.0 TDI"` |
| `get_available_pids(vehicleId?)` | → PIDs soportados (bitmask `01 00/20/40/60` + catalogo) |
| `get_ecu_info()` | → `"ECM (Engine, 7E0→7E8) — ISO 15765-4"` |

**Conocimiento / RAG (8)** — `search_similar_pids`, `search_similar_dtcs`,
`search_similar_ecus`, `search_similar_diagnoses`, `index_pid`, `index_dtc`, `index_ecu`,
`index_diagnosis`. Busqueda semantica sobre LanceDB y escritura del catalogo
auto-expansivo ([ADR 007](docs/adr/007-catalogo-auto-expansivo-lancedb.md)).

**Web (1)** — `web_search`, ultimo recurso cuando el catalogo no sabe. Presupuesto maximo
de 3 busquedas por sesion y resultado envuelto en `<untrusted-web-result>`.

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

TDD estricto: primero el test que falla. **2.519 tests en verde** repartidos en 228
ficheros (core-api 1.806 en 156, UI 713 en 72), verificado el 2026-09-01.

```bash
pnpm verify            # gate pre-push completo: lint + format + coverage + build (ambas apps)
pnpm test:all          # las dos suites
pnpm test              # solo core-api
pnpm test:coverage     # coverage core-api (Core 100 %, Features >= 80 %)
```

El coverage entra en el gate y en CI. La estrategia por capas —Core al 100 %, Features
por encima del 80 %, infraestructura excluida— esta en `.opencode/skills/coverage-strategy/`.

## Documentacion

- **ADR** — 9 decisiones en [`docs/adr/`](docs/adr/)
- **Documentacion tecnica del TFM** — [`docs/tfm/`](docs/tfm/README.md): MCP, embeddings y
  RAG, OBD-II y emulador, diagnostico cognitivo, arquitectura y UI
- **Despliegue** — [`docs/infrastructure/despliegue.md`](docs/infrastructure/despliegue.md):
  cadena CI/CD, como saber que version corre y como volver atras
- **Seguridad** — [`docs/security.md`](docs/security.md): OWASP API Top 10 2023 completo
- **Entrega del TFM** — [`docs/entrega-tfm.md`](docs/entrega-tfm.md) y
  [`docs/guion-video.md`](docs/guion-video.md)
- **TSDoc** — export publico con CI (`jsdoc/require-jsdoc`)
- **[AGENTS.md](AGENTS.md)** — Reglas de sesion, agentes, skills, convenciones
