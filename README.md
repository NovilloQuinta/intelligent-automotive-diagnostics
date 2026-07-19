# Intelligent Automotive Diagnostics

> **TFM — Máster IA** · Jesús Novillo · Julio 2026
>
> Simulación de telemetría vehicular y diagnóstico con IA mediante el protocolo MCP (Model Context Protocol).
> Catálogo de PIDs auto-expansivo asistido por LLM. Cumplimiento SAE J1979 / ISO 15031 / ISO 3779.

## Stack

| Capa | Tecnología |
|---|---|
| Runtime | Node 22+ (ESM) |
| Lenguaje | TypeScript 5.7+ estricto |
| Framework web | Express 5 + Zod + Helmet |
| IA / Agentes | MCP SDK (`@modelcontextprotocol/sdk` v1.29) |
| Persistencia | SQLite + Drizzle ORM |
| Vectorial | LanceDB (Fase 2b) |
| Tests | Vitest 3 |
| Package manager | pnpm 10 |
| Dev tooling | tsx (dev), tsc (build) |
| Documentación API | Swagger UI + OpenAPI 3.0 |
| CI | GitHub Actions |
| Normativa | SAE J1979, ISO 15031-5, ISO 3779 (VIN) |
| OBD Reference | ELM327-emulator v3.0.5 (Python, sidecar Docker) |

## Inicio rápido

```bash
# 1. Instalar dependencias
pnpm install

# 2. Iniciar API en modo desarrollo (hot-reload)
cd apps/core-api
pnpm dev

# 3. Abrir Swagger UI
open http://localhost:4000/api-docs
```

**Disponible en `http://localhost:4000`:**

| Endpoint | Método | Descripción |
|---|---|---|
| `/api-docs` | GET | Swagger UI interactivo (Try it out) |
| `/api/scenarios` | GET | Lista de escenarios de simulación |
| `/api/diagnosis` | POST | Diagnóstico determinista `{ scenarioId }` |
| `/api/mcp/tools/:toolName` | POST | Invocar tool MCP `{ scenarioId, args }` |

### Prerrequisitos

- **Node.js** 22+ (LTS)
- **pnpm** 10+
- **Docker Desktop** (opcional, solo para el emulador ELM327)

### Variables de entorno (`.env`)

```env
OBD_MODE=sync              # sync = simulador interno | elm327 = emulador real
ELM327_HOST=localhost      # Host del emulador ELM327
ELM327_PORT=35000          # Puerto del emulador
ANTHROPIC_API_KEY=         # API key de Anthropic (solo para diagnóstico cognitivo)
```

## Arquitectura

Clean Architecture estricta con 3 capas y dependencia unidireccional:

```
domain/ ← application/ ← infrastructure/
```

[ADR 001](docs/adr/001-arquitectura-del-sistema.md) — justificación completa.

```
apps/core-api/src/
├── domain/entities/              # 11 entidades puras (sin dependencias)
│   ├── vehicleProfile.ts         # Perfil completo (VIN, ECUs, PIDs)
│   ├── ecuInfo.ts                # Unidad de control electrónica
│   ├── pidDefinition.ts          # PID OBD-II (modo, fórmula, tipo)
│   ├── diagnosisSession.ts       # Sesión de diagnóstico
│   ├── diagnosisResult.ts        # Resultado determinista
│   ├── cognitiveDiagnosisResult.ts # Resultado cognitivo (LLM)
│   ├── toolCallTrace.ts          # Traza de tools MCP invocadas
│   ├── freezeFrame.ts            # Snapshot Service 02
│   ├── liveData.ts               # Datos en vivo (legacy)
│   ├── dtcCode.ts                # Código de fallo
│   └── vehicleInfo.ts            # Info estática (VIN requerido)
│
├── application/                  # Puertos + Casos de uso
│   ├── ports/
│   │   ├── obdRepository.interface.ts    # 8 métodos (5 services SAE J1979)
│   │   └── vehicleRepository.interface.ts # CRUD catálogo auto-expansivo
│   └── diagnostics/
│       └── processVehicleDiagnosis.ts    # Core determinista
│
├── infrastructure/
│   ├── hardware-simulator/        # ObdSimulator + repositorio + escenarios
│   ├── obd/protocol/
│   │   ├── pidParser.ts           # Shunting-yard (SAE J1979 formulas)
│   │   └── vinDecoder.ts          # ISO 3779 validator + check digit + WMI
│   ├── persistence/sqlite/        # Drizzle ORM + 5 tablas + seed data
│   ├── mcp/
│   │   └── mcpServer.ts           # 6 tools MCP (ObdRepository + VehicleRepository)
│   └── http/
│       ├── server.ts              # Express + CORS + helmet + Swagger
│       ├── swagger.ts             # OpenAPI 3.0 spec
│       └── controllers/
│           └── diagnosisController.ts
│
└── main.ts                        # Composition root
```

## Casos de uso

| Caso de uso | Ruta | Estado |
|---|---|---|
| **ProcessVehicleDiagnosis** | `application/diagnostics/processVehicleDiagnosis.ts` | ✅ Implementado (7 tests) |
| **ExecuteCognitiveDiagnosis** | `application/agents/executeCognitiveDiagnosis.ts` | 🔜 Fase 2b |
| **DiscoverVehicle** | `application/discovery/discoverVehicle.ts` | 🔜 Fase 2b |
| **ScanEcus** | `application/discovery/scanEcus.ts` | 🔜 Fase 2b |
| **StreamActiveTelemetry** | `application/diagnostics/activeTelemetryStream.ts` | ⏳ Fase 3 |
| **SwitchSimulationScenario** | `application/simulation/switchSimulationScenario.ts` | ⏳ Fase 3 |

## MCP Server — 6 tools disponibles

| Tool | Fuente | Ejemplo |
|---|---|---|
| `read_pid(mode, pid)` | ObdRepository (Service 01) | `read_pid("01", "0C")` → `"750"` |
| `get_dtc_codes()` | ObdRepository (Service 03) | `get_dtc_codes()` → `"P0301"` |
| `get_freeze_frame(dtc?)` | ObdRepository (Service 02) | `get_freeze_frame("P0301")` → valores congelados |
| `read_vin()` | ObdRepository (Service 09) | `read_vin()` → `"WAUZZZ8V5JA123456"` |
| `get_vehicle_info()` | ObdRepository | `get_vehicle_info()` → `"Audi A3 (2018) — 2.0 TFSI"` |
| `get_available_pids(vehicleId?)` | VehicleRepository (catálogo) | Lista de PIDs conocidos |

**Probar sin API key:**

```bash
curl -X POST http://localhost:4000/api/mcp/tools/read_pid \
  -H "Content-Type: application/json" \
  -d '{"scenarioId":"audi-a3-idle","args":{"mode":"01","pid":"0C"}}'

# → {"tool":"read_pid","result":"750"}
```

## Normativa

Cumplimiento documentado en [ADR 006](docs/adr/006-compliance-sae-j1979.md):

| Estándar | Cobertura |
|---|---|
| **SAE J1979** | Services 01, 02, 03, 04, 09 implementados. 16 fórmulas Mode 01 verificadas |
| **ISO 15031-5** | Equivalente internacional de SAE J1979 |
| **ISO 3779** | VIN: 17 chars, sin I/O/Q, check digit, WMI lookup |

## Testing

```bash
pnpm test            # 125 tests en 8 suites
pnpm test:watch      # Modo watch TDD
pnpm test:coverage   # Cobertura
```

| Suite | Tests | Capa |
|---|---|---|
| `pidParser.test.ts` | 44 | Parser Shunting-yard (22 fórmulas + operadores + edges) |
| `server.test.ts` | 20 | Integración HTTP real + MCP endpoint |
| `vinDecoder.test.ts` | 18 | VIN: decode, validate, check digit, WMI |
| `vehicleRepository.test.ts` | 16 | CRUD + validación VIN ISO 3779 |
| `mcpServer.test.ts` | 11 | 6 tools + 3 edge cases |
| `processVehicleDiagnosis.test.ts` | 7 | readPid + freeze frame + severidad |
| `obdSimulator.test.ts` | 6 | Codificación/decodificación |
| `diagnosisController.test.ts` | 3 | Scenarios + diagnosis + 404 |

## Scripts

```bash
# API
pnpm dev            # Arrancar servidor (hot-reload)
pnpm build          # Compilar TypeScript

# Tests
pnpm test           # Ejecutar suite completa (125 tests)
pnpm test:watch     # Modo watch TDD
pnpm test:coverage  # Cobertura

# Calidad
pnpm lint           # ESLint + TSDoc (eslint-plugin-jsdoc)
pnpm format         # Prettier check

# Base de datos
pnpm db:generate    # Generar migraciones desde schema.ts
pnpm db:migrate     # Aplicar migraciones a SQLite

# OBD (requiere Docker: docker compose up -d elm327)
pnpm tsx scripts/send-obd.ts "01 0C"
pnpm tsx scripts/scan-pids.ts
```

## CI

GitHub Actions en cada push/PR a `main`: `pnpm install` + `pnpm lint` + `pnpm test` (Node 22, pnpm 10).

[workflow](.github/workflows/ci.yml)

## Fases del proyecto

| Fase | Estado | Tests | Entregables |
|---|---|---|---|
| **Fase 1** (1-10 jul) | ✅ Completada | 43 | Express API, simulador OBD, parser hex, tests |
| **Fase 2a** (12-18 jul) | ✅ Completada | 125 | SQLite/Drizzle, PidParser, MCP Server, VIN decoder, Swagger, CI |
| **Fase 2b** (18-19 jul) | 🔜 En curso | — | Diagnóstico cognitivo LLM, LanceDB, protocolo OBD TCP |
| **Fase 3** (19-20 jul) | ⏳ Pendiente | — | Streaming, cambio escenarios, defensa |

## Documentación

Filosofía **"Documentation As You Code"**:

- **ADR** — 6 decisiones arquitectónicas en `docs/adr/`
- **TSDoc** — Cada export público en `domain/`, `application/` e `infrastructure/`
- **CI Docs** — Verificación en pipeline (`pnpm lint` incluye TSDoc via eslint-plugin-jsdoc)
- **[CLAUDE.md](CLAUDE.md)** — Reglas del proyecto, skills, convenciones
- **[fase-2-plan-v2.md](docs/fase-2-plan-v2.md)** — Plan detallado Fase 2

## Licencia

Proyecto académico — Máster IA.
