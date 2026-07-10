# Intelligent Automotive Diagnostics

> **TFM — Máster IA** · Jesús Novillo · Julio 2026
>
> Simulación de telemetría vehicular y diagnóstico con IA mediante el protocolo MCP (Model Context Protocol).

## Stack

| Capa | Tecnología |
|---|---|
| Runtime | Node 20+ (ESM) |
| Lenguaje | TypeScript 5.7+ estricto |
| Framework web | Express 5 + Zod |
| IA / Agentes | MCP SDK (`@modelcontextprotocol/sdk`) |
| Tests | Vitest 3 |
| Package manager | pnpm |
| Dev tooling | tsx (dev), tsc (build) |

## Arquitectura

Clean Architecture en 3 capas con MCP como adaptador de IA:

```
apps/core-api/src/
├── domain/               # Entidades puras e interfaces (sin dependencias externas)
├── usecases/             # Lógica de aplicación / orquestación
└── infrastructure/       # Adaptadores técnicos (simulador, parsers, MCP, HTTP, BD)
```

[ADR 001](docs/adr/001-arquitectura-del-sistema.md) — justificación completa de la arquitectura.

## Inicio rápido

```bash
# 1. Instalar dependencias
pnpm install

# 2. Iniciar en modo desarrollo (hot-reload)
pnpm dev

# 3. Ejecutar tests
pnpm test
```

### Prerrequisitos

- **Node.js** 20+ (recomendado: 22 LTS)
- **pnpm** 9+

## Casos de uso core

| Caso de uso | Ruta | Rol |
|---|---|---|
| ProcessVehicleDiagnosis | `usecases/diagnostics/processVehicleDiagnosis.ts` | Flujo determinista: bytes → parseo → diagnóstico |
| ExecuteCognitiveDiagnosis | `usecases/agents/executeCognitiveDiagnosis.ts` | Corazón del TFM: IA agéntica vía MCP tool calling |
| StreamActiveTelemetry | `usecases/telemetry/streamActiveTelemetry.ts` | Streaming reactivo de datos en vivo (RPM, temp…) |
| SwitchSimulationScenario | `usecases/simulation/switchSimulationScenario.ts` | Cambio dinámico de escenario en demo en vivo |

## Testing

```bash
pnpm test            # Ejecutar suite completa
pnpm test:watch      # Modo watch TDD
```

- Tests unitarios del parser hexadecimal (SAE J1979)
- Tests con mocks del flujo de diagnóstico
- Tests de integración del servidor MCP (Fase 2)

## Documentación

Este proyecto sigue la filosofía **"Documentación As You Code"**:

- **ADR** — Decisiones arquitectónicas documentadas en `docs/adr/`
- **TSDoc** — Cada entidad, caso de uso y adaptador incluye documentación TSDoc
- **Código + docs** — La documentación vive en el mismo repositorio, junto al código que describe
- **CI** — Verificación de documentación en el pipeline (`pnpm lint:docs`)

## Fases del proyecto

| Fase | Fechas | Entregables |
|---|---|---|
| **Fase 1** — Base técnica | 1–10 jul | `domain/`, simulador OBD, parser hex, `processVehicleDiagnosis`, tests |
| **Fase 2** — Capa IA | 11–15 jul | `mcpServer.ts`, `executeCognitiveDiagnosis.ts` |
| **Fase 3** — Cierre | 16–20 jul | Streaming, cambio de escenarios, README final, defensa |

## Licencia

Proyecto académico — Máster IA.
