# Intelligent Automotive Diagnostics — TFM

> Vehícular telemetry simulation & AI-powered diagnosis using Model Context Protocol (MCP).
> Máster IA — Jesús Novillo
> Entrega: 20 julio 2026

## Stack

- **Runtime**: Node 20+ (ESM)
- **Lenguaje**: TypeScript 5.7+ estricto
- **Framework web**: Express 5 + Zod
- **IA/Agentes**: MCP SDK (`@modelcontextprotocol/sdk`)
- **Persistencia**: SQLite + Drizzle ORM (catálogo auto-expansivo de PIDs)
- **Vectorial**: LanceDB (búsqueda semántica de PIDs, Fase 2b)
- **Tests**: Vitest 3
- **Package manager**: pnpm
- **Tooling**: tsx (dev), tsc (build)
- **Contenedores**: Docker + Docker Compose
- **OBD Reference**: ELM327-emulator v3.0.5 (Python 3.11, sidecar de testing)

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

```bash
# La BD se crea automáticamente en data/diagnostics.db al iniciar la API.
# En tests se usa :memory: (sin archivo).
```

## Arquitectura (Clean Architecture + MCP)

```
apps/core-api/src/
├── domain/                     # Capa 1: Entidades puras (sin dependencias externas)
│   └── entities/
│       ├── vehicleProfile.ts   # VehicleProfile, DiagnosisSession
│       ├── ecuInfo.ts          # EcuInfo (descubrimiento de ECUs)
│       ├── pidDefinition.ts    # PidDefinition, PidReading (catálogo)
│       ├── vehicleInfo.ts      # LiveData, DTC, estados del vehículo (legacy)
│       └── ...
│
├── application/                # Capa 2: Puertos + Casos de uso
│   ├── ports/
│   │   ├── obdRepository.interface.ts    # Contrato de adquisición de datos
│   │   └── vehicleRepository.interface.ts # CRUD catálogo auto-expansivo
│   ├── diagnostics/
│   │   ├── processVehicleDiagnosis.ts    # Core: lectura → conversión → diagnóstico
│   │   └── activeTelemetryStream.ts      # Streaming reactivo de PIDs
│   ├── agents/
│   │   └── executeCognitiveDiagnosis.ts  # Evaluación con IA vía MCP
│   ├── discovery/              # Descubrimiento de vehículos y PIDs (Fase 2a)
│   │   ├── discoverVehicle.ts  # VIN + PIDs soportados → BD
│   │   └── scanEcus.ts         # TesterPresent → descubre ECUs en el bus
│   └── simulation/
│       └── switchSimulationScenario.ts   # Cambio dinámico de escenarios
│
├── infrastructure/             # Capa 3: Adaptadores técnicos
│   ├── hardware-simulator/
│   │   └── obdSimulator.ts     # Simulador de bytes (Audi A3 / Kawasaki)
│   ├── math-parsers/
│   │   └── hexParser.ts        # Conversor SAE J1979 (HEX → magnitudes físicas)
│   ├── mcp/
│   │   └── mcpServer.ts        # Servidor MCP (herramientas para el LLM)
│   ├── obd/                    # Capa de protocolo OBD-II (Fase 2)
│   │   ├── elm327Client.ts     # Cliente TCP al emulador ELM327
│   │   └── protocol/           # Decodificadores de protocolo
│   │       ├── pidParser.ts    # Parser genérico de fórmulas (refactor de hexParser)
│   │       ├── vinDecoder.ts   # Decodificador VIN (Mode 09)
│   │       ├── pidScanner.ts   # Scanner de PIDs soportados (Mode 01)
│   │       └── ecuScanner.ts   # Descubrimiento de ECUs (AT SH + TesterPresent)
│   ├── persistence/            # Capa de persistencia
│   │   ├── sqlite/
│   │   │   ├── schema.ts       # Schema Drizzle (vehicles, ecus, pid_definitions, ...)
│   │   │   ├── db.ts           # Init SQLite + Drizzle
│   │   │   └── vehicleRepository.ts  # Implementación de VehicleRepository
│   │   └── vector/             # LanceDB (Fase 2b)
│   │       └── lancedb.ts
│   └── http/
│       ├── controllers/
│       │   └── diagnosisController.ts
│       └── server.ts           # Express
│
└── main.ts                     # Composition root / DI manual
│
├── main.ts                     # Composition root / DI manual
```

```
raiz/
├── docker/
│   └── elm327/Dockerfile            # Contenedor ELM327-emulator (testing)
├── docker-compose.yml               # Servicios de desarrollo
├── scripts/
│   ├── send-obd.ts                  # Envia comandos OBD al emulador
│   └── scan-pids.ts                 # Escanea PIDs soportados
├── apps/
│   └── core-api/...
```

## Casos de Uso Core

| Use Case | Archivo | Rol en la demo |
|---|---|---|
| `ProcessVehicleDiagnosis` | `application/diagnostics/processVehicleDiagnosis.ts` | Flujo determinista: bytes → parseo → diagnóstico |
| `ExecuteCognitiveDiagnosis` | `application/agents/executeCognitiveDiagnosis.ts` | Corazón del TFM: IA agéntica vía MCP tool calling |
| `DiscoverVehicle` | `application/discovery/discoverVehicle.ts` | Descubrimiento: VIN + PIDs → catálogo auto-expansivo |
| `ScanEcus` | `application/discovery/scanEcus.ts` | Descubrimiento de ECUs en el bus |
| `StreamActiveTelemetry` | `application/diagnostics/activeTelemetryStream.ts` | Streaming reactivo de datos en vivo (RPM, temp...) |
| `SwitchSimulationScenario` | `application/simulation/switchSimulationScenario.ts` | Cambio dinámico de escenario en demo en vivo |

## Tests

```bash
pnpm test           # vitest run (56 tests)
pnpm test:watch     # vitest watch
pnpm test:coverage  # vitest run --coverage
```

## CI (GitHub Actions)

Push a `main` y PRs ejecutan `pnpm lint` + `pnpm test` en Node 22 + pnpm 10.

```yaml
.github/workflows/ci.yml
```

### Pirámide de testing

| Nivel | Peso | Ejemplos en el proyecto | Meta de cobertura |
|---|---|---|---|
| **Unitarias** | ~70% | `hexParser.test.ts`, `obdSimulator.test.ts`, `processVehicleDiagnosis.test.ts` | ≥ 90% por módulo |
| **Integración** | ~25% | `server.test.ts` (Express + fetch real), `diagnosisController.test.ts` | ≥ 80% |
| **E2E** | ~5% | Flujo login → diagnóstico visual (Playwright, Fase 3) | Flujo crítico |

### Umbrales de coverage (Vitest)

```
application/**      ≥ 90% statements
infrastructure/** ≥ 80% statements
domain/**         excluido (solo tipos)
main.ts, scripts/ excluido (composition root / tooling)
```

### Mock boundaries

- Mock **solo** en infraestructura: `ObdRepository`, HTTP, file system
- **Nunca** mockear entidades de dominio ni funciones puras (parser, validators)
- Vitest `vi.mock()` para boundaries; implementaciones reales para lógica de dominio

## Estado actual del proyecto

### Estructura implementada

```
apps/core-api/src/
├── domain/entities/             # vehicleProfile, ecuInfo, pidDefinition, vehicleInfo, liveData, dtcCode, diagnosisResult
├── application/ports/           # obdRepository.interface, vehicleRepository.interface
├── application/diagnostics/     # processVehicleDiagnosis
├── application/discovery/       # (Fase 2a)
├── application/agents/          # (Fase 2b)
├── application/simulation/      # (Fase 3)
├── infrastructure/hardware-simulator/ # obdSimulator, obdSimulatorRepository, simulationScenario
├── infrastructure/math-parsers/      # hexParser (SAE J1979)
├── infrastructure/http/              # server.ts, controllers/diagnosisController
├── infrastructure/persistence/       # sqlite/ (schema, db, vehicleRepository)
├── infrastructure/mcp/               # (Fase 2b)
└── main.ts                            # Composition root (Express :4000)
```

```
raiz/
├── docker/elm327/Dockerfile         # ELM327-emulator container (testing)
├── docker-compose.yml               # Servicios de desarrollo
├── scripts/
│   ├── send-obd.ts                  # Enviar comandos OBD al emulador
│   └── scan-pids.ts                 # Escanear PIDs soportados
├── docs/
│   ├── adr/                         # 4 ADRs (incl. 004-elm327-emulador)
│   └── infrastructure/              # Guia de infra (elm327-emulator.md)
├── package.json                     # Scripts del monorepo (obd:send, obd:scan)
└── .env                             # ELM327_HOST, ELM327_PORT
```

### Pendiente por fase

- **Fase 1** (base tecnica, hasta 10 jul): Completada — 43 tests, Express API, ELM327-emulator en Docker
- **Fase 2a** (persistencia + protocolo, en curso): SQLite/Drizzle + catálogo auto-expansivo + clientes OBD
- **Fase 2b** (capa IA, hasta 15 jul): `mcpServer.ts`, `executeCognitiveDiagnosis.ts`, LanceDB
- **Fase 3** (cierre, hasta 20 jul): streaming, cambio de escenarios, README final

## Convenciones

- **Commits**: imperativo, español, <72 chars, prefijos `feat:` / `fix:` / `test:` / `docs:`
- **Imports**: ES modules (`import/export`), named exports siempre
- **Tipado**: estricto, evitar `any`
- **Comentarios**: solo el "porqué" no obvio
- **Estructura**: 1 fichero ≈ 1 responsabilidad
- **KISS**: solve the problem at hand, don't abstract for hypothetical futures
- **DRY**: extract duplication into shared constants/utilities, but avoid premature abstraction
- **YAGNI**: don't write code you don't need yet — no generic interfaces "just in case"

## Documentación

Filosofía **"Documentation As You Code"** — la documentación se escribe al mismo tiempo que el código.

- **TSDoc obligatorio** en toda export pública de `domain/`, `application/` e `infrastructure/`: parámetros, retorno, errores, propósito
- **ADR** en `docs/adr/` para cada decisión arquitectónica significativa (formato Michael Nygard)
- **README.md** raíz como punto de entrada: quick start, arquitectura, testing, fases
- **Linter de docs** disponible: `pnpm lint:docs` — verifica existencia de documentos clave y presencia de TSDoc en archivos fuente
- **Docs cerca del código**: tests junto al .ts que prueban (`*.test.ts`), documentación de esquemas en `docs/db/`
- **Documentar el "por qué"**, no el "qué" — el código ya dice lo que hace

## Skills (incluidas en el proyecto)

Las skills viven en `.opencode/skills/` (autocontenidas, no dependen de paths externos):

| Skill | Path | Cuándo cargar |
|---|---|---|
| `clean-architecture` | `.opencode/skills/clean-architecture/` | Antes de crear/mover ficheros entre capas |
| `typescript-best-practices` | `.opencode/skills/typescript-best-practices/` | Al escribir o revisar TypeScript |
| `tdd-workflow` | `.opencode/skills/tdd-workflow/` | Antes de escribir tests o ciclo Red-Green-Refactor |
| `tsdoc-jsdoc-documentation` | `.opencode/skills/tsdoc-jsdoc-documentation/` | Antes de crear o revisar TSDoc en exports públicos |

Cárgalas con `skill` tool al inicio de cada fase de desarrollo.

## Additional docs

Full project documentation (vision, architecture, planning) lives in the Obsidian vault:
- `/data/01_Proyectos/01_p_web_intelligent_auto_diagnosis/`

## Reglas de sesión

1. **Cargar skills** (`tdd-workflow`, `typescript-best-practices`, etc.) al inicio de cada fase
2. **Preguntar antes de commitear/pushear** — mostrar diff, esperar OK humano
3. **1 paso a la vez** — no mezclar varias responsabilidades en una tanda (ej. entidades + parser + tests + commit)
4. **Leer CLAUDE.md como checklist al arrancar sesión** — antes de tocar código, repasar reglas activas
