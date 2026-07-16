# Intelligent Automotive Diagnostics — TFM

> Vehícular telemetry simulation & AI-powered diagnosis using Model Context Protocol (MCP).
> Máster IA — Jesús Novillo
> Entrega: 20 julio 2026

## Stack

- **Runtime**: Node 20+ (ESM)
- **Lenguaje**: TypeScript 5.7+ estricto
- **Framework web**: Express 5 + Zod
- **IA/Agentes**: MCP SDK (`@modelcontextprotocol/sdk`)
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

## Arquitectura (Clean Architecture + MCP)

```
apps/core-api/src/
├── domain/                     # Capa 1: Entidades e interfaces puras
│   ├── entities/
│   │   └── vehicle.ts          # LiveData, DTC, estados del vehículo
│   └── repositories/
│       └── obdRepository.interface.ts  # Contrato de adquisición de datos
│
├── usecases/                   # Capa 2: Lógica de aplicación / orquestación
│   ├── diagnostics/
│   │   ├── processVehicleDiagnosis.ts    # Core: lectura → conversión → diagnóstico
│   │   └── activeTelemetryStream.ts      # Streaming reactivo de PIDs
│   ├── agents/
│   │   └── executeCognitiveDiagnosis.ts  # Evaluación con IA vía MCP
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
│   └── http/
│       ├── controllers/
│       │   └── diagnosisController.ts
│       └── server.ts           # Express / Fastify
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

## 4 Casos de Uso Core

| Use Case | Archivo | Rol en la demo |
|---|---|---|
| `ProcessVehicleDiagnosis` | `usecases/diagnostics/processVehicleDiagnosis.ts` | Flujo determinista: bytes → parseo → diagnóstico |
| `ExecuteCognitiveDiagnosis` | `usecases/agents/executeCognitiveDiagnosis.ts` | Corazón del TFM: IA agéntica vía MCP tool calling |
| `StreamActiveTelemetry` | `usecases/telemetry/streamActiveTelemetry.ts` | Streaming reactivo de datos en vivo (RPM, temp...) |
| `SwitchSimulationScenario` | `usecases/simulation/switchSimulationScenario.ts` | Cambio dinámico de escenario en demo en vivo |

## Tests

```bash
pnpm test           # vitest run (43 tests)
pnpm test:watch     # vitest watch
pnpm test:coverage  # vitest run --coverage
```

### Pirámide de testing

| Nivel | Peso | Ejemplos en el proyecto | Meta de cobertura |
|---|---|---|---|
| **Unitarias** | ~70% | `hexParser.test.ts`, `obdSimulator.test.ts`, `processVehicleDiagnosis.test.ts` | ≥ 90% por módulo |
| **Integración** | ~25% | `server.test.ts` (Express + fetch real), `diagnosisController.test.ts` | ≥ 80% |
| **E2E** | ~5% | Flujo login → diagnóstico visual (Playwright, Fase 3) | Flujo crítico |

### Umbrales de coverage (Vitest)

```
usecases/**      ≥ 90% statements
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
├── domain/entities/             # vehicleInfo, liveData, dtcCode, diagnosisResult
├── domain/repositories/         # obdRepository.interface
├── usecases/diagnostics/        # processVehicleDiagnosis
├── usecases/agents/             # (Fase 2)
├── usecases/simulation/         # (Fase 3)
├── infrastructure/hardware-simulator/ # obdSimulator, obdSimulatorRepository, simulationScenario
├── infrastructure/math-parsers/      # hexParser (SAE J1979)
├── infrastructure/http/              # server.ts, controllers/diagnosisController
├── infrastructure/mcp/               # (Fase 2)
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
- **Fase 2** (capa IA, hasta 15 jul): `mcpServer.ts`, `executeCognitiveDiagnosis.ts`
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

- **TSDoc obligatorio** en toda export pública de `domain/`, `usecases/` e `infrastructure/`: parámetros, retorno, errores, propósito
- **ADR** en `docs/adr/` para cada decisión arquitectónica significativa (formato Michael Nygard)
- **README.md** raíz como punto de entrada: quick start, arquitectura, testing, fases
- **Linter de docs** disponible: `pnpm lint:docs` — verifica existencia de documentos clave y presencia de TSDoc en archivos fuente
- **Docs cerca del código**: tests junto al .ts que prueban (`*.test.ts`), documentación de esquemas en `docs/db/`
- **Documentar el "por qué"**, no el "qué" — el código ya dice lo que hace

## Skills (incluidas en el proyecto)

Las skills viven en `.opencode/skills/` (autocontenidas, no dependen de paths externos):

| Skill | Path | Cuándo cargar |
|---|---|---|
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
