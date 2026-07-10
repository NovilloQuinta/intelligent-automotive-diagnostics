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

## 4 Casos de Uso Core

| Use Case | Archivo | Rol en la demo |
|---|---|---|
| `ProcessVehicleDiagnosis` | `usecases/diagnostics/processVehicleDiagnosis.ts` | Flujo determinista: bytes → parseo → diagnóstico |
| `ExecuteCognitiveDiagnosis` | `usecases/agents/executeCognitiveDiagnosis.ts` | Corazón del TFM: IA agéntica vía MCP tool calling |
| `StreamActiveTelemetry` | `usecases/telemetry/streamActiveTelemetry.ts` | Streaming reactivo de datos en vivo (RPM, temp...) |
| `SwitchSimulationScenario` | `usecases/simulation/switchSimulationScenario.ts` | Cambio dinámico de escenario en demo en vivo |

## Tests

```bash
pnpm test         # vitest run
pnpm test:watch   # vitest watch
```

- Tests unitarios matemáticos del `hexParser` (SAE J1979)
- Tests con mocks del `processVehicleDiagnosis`

## Estado actual del proyecto

Lo que existe ahora en `apps/core-api/`:
- `package.json` — dependencias y scripts
- `tsconfig.json` — compilador TS

Pendiente por fase:
- **Fase 1** (base técnica, hasta 10 jul): `domain/`, `obdSimulator.ts`, `hexParser.ts`, `processVehicleDiagnosis.ts`, tests unitarios
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

## Skills

- `typescript-best-practices` — load when writing or reviewing TypeScript code (naming, typing, utility types, code quality)
- `tdd-workflow` — load before writing tests or starting a Red-Green-Refactor cycle

## Additional docs

Full project documentation (vision, architecture, planning) lives in the Obsidian vault:
- `/data/01_Proyectos/01_p_web_intelligent_auto_diagnosis/`
