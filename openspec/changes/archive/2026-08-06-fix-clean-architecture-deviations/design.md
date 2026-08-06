## Context

Rama `fix/clean-architecture-deviations`. Fase 4 (Diagnóstico Cognitivo LLM). Stack: TypeScript ESM strict, Express 5, Clean Architecture + Hexagonal, Vitest. Suite actual: 404 tests verdes (29 ficheros).

El proyecto sigue Clean Architecture con disciplina: `domain ← application ← infrastructure`, 10 puertos, 8+ adaptadores, cero violaciones de dependencia entre capas. La auditoría del 2026-08-06 encontró dos desviaciones de consistencia interna (no de regla de dependencia):

1. **`DiagnosisController`** (~270 líneas) mezcla HTTP + resolución de repositorios + creación de casos de uso. El patrón correcto ya existe en `AuthController`: recibe los casos de uso por constructor y solo maneja HTTP.
2. **`ExecuteLlmToolCalling`** usa `console.error` en vez del `LoggerPort` que el proyecto ya inyecta en `RegisterUserUseCase`, `LoginUserUseCase` y `LogoutUserUseCase`.

`AuthController` es el golden reference: recibe 5 casos de uso por constructor, cero lógica de negocio, cero creación de dependencias.

## Goals / Non-Goals

**Goals:**
- Extraer `DiagnosisService` a `infrastructure/services/diagnosisService.ts` con la resolución dinámica de repositorios y orquestación de casos de uso.
- `DiagnosisController` recibe `DiagnosisService` por constructor y solo maneja HTTP (parseo, delegación, status codes, error responses).
- `composition.ts` crea `DiagnosisService` y lo inyecta (mismo patrón que `authService`).
- `ExecuteLlmToolCalling` recibe `LoggerPort` por constructor y lo usa en vez de `console.error`.
- La cadena completa propaga el logger: `composition.ts` → `createAnthropicClient`/`createOpenAiClient` → `composeLlmClient` → `ExecuteLlmToolCalling`.
- TDD estricto: RED → GREEN → REFACTOR. Zero Broken Windows (lint + test + build verdes en cada commit).
- Tests existentes del controlador se adaptan al nuevo constructor.

**Non-Goals:**
- No cambia la firma de `ProcessVehicleDiagnosisUseCase`, `ExecuteCognitiveDiagnosisUseCase`, `ExecuteLlmToolCalling.execute()` ni `LlmClientPort`.
- No cambia el comportamiento HTTP (mismos endpoints, mismos status codes, mismos bodies).
- No toca `createLlmAdapter.ts` (el logger se inyecta en `composeLlmClient`, no en el adapter genérico).
- No cambia la estructura de puertos en `application/ports/`.
- No modifica `createMcpServer` ni el protocolo MCP.

## Decisions

### 1. `DiagnosisService` como servicio de infraestructura (no caso de uso)

**Elegido**: `DiagnosisService` en `infrastructure/services/diagnosisService.ts`. Es un orchestrator que vive en infraestructura: resuelve repositorios concretos (`Elm327TcpRepository` u `ObdSimulatorRepository`), instancia casos de uso y los ejecuta. El controlador solo maneja HTTP.

**Rechazado (a)**: Mover la resolución de repositorios a un `DiagnosisUseCaseFactory` en capa de aplicación. Incorrecto: la capa de aplicación no debe conocer `ObdSimulator` ni `Elm327TcpRepository` (son detalles de infraestructura).

**Rechazado (b)**: Inyectar una factory `(scenarioId) => ProcessVehicleDiagnosisUseCase` en el controlador. Mezcla concerns de composición en el controlador y requiere un tipo de factory que cambia por cada caso de uso nuevo.

**Razón**: El patrón es análogo a `authService.ts` — un servicio de infraestructura que orquesta lógica entre múltiples dependencias concretas antes de delegar a casos de uso. Vive en la capa correcta (infraestructura) y el controlador queda como adapter puro.

### 2. `DiagnosisService` expone métodos de alto nivel, no el repositorio

**Elegido**: `diagnose(scenarioId?)`, `cognitiveDiagnosis(scenarioId?, userQuery?)`, `callMcpTool(toolName, scenarioId?, args)`, `listScenarios()`. Cada método resuelve el repositorio, crea el caso de uso, lo ejecuta y devuelve el resultado de dominio.

**Rechazado**: Exponer `resolveRepository(scenarioId)` como método público y dejar que el controlador cree los casos de uso. Perpetúa el problema: el controlador sigue siendo mini-composition-root.

### 3. Constructor de `DiagnosisService` con dependencias explícitas

```typescript
export class DiagnosisService {
  constructor(
    private readonly scenarios: SimulationScenario[],
    private readonly obdRepo: ObdRepository | undefined,
    private readonly llmClient: LlmClientPort | undefined,
    private readonly logger: LoggerPort,
  ) {}
}
```

`obdRepo` y `llmClient` son `| undefined` porque en modo simulación pura sin LLM configurado, ciertos métodos no están disponibles. El servicio lanza errores tipados (`CognitiveDiagnosisUnavailableError`) si se invoca `cognitiveDiagnosis()` sin `llmClient`.

### 4. `LoggerPort` en `ExecuteLlmToolCalling`: parámetro requerido, no opcional

**Elegido**: `LoggerPort` como tercer parámetro requerido del constructor de `ExecuteLlmToolCalling`. La cadena de propagación:

```
composition.ts: logger
  → createAnthropicClient({ ..., logger })
    → composeLlmClient(sendSingleMessage, maxIterations, logger)
      → new ExecuteLlmToolCalling(sendSingleMessage, maxIterations, logger)
```

`AnthropicClientConfig` y `OpenAiClientConfig` ganan `logger?: LoggerPort` (opcional en config para no romper tests existentes, default a `console` si no se provee).

**Rechazado**: Hacer `LoggerPort` opcional con fallback a `console`. Perpetúa el acoplamiento a la plataforma; el objetivo es eliminarlo.

**Rechazado**: Inyectar logger en `createLlmAdapter`. El adapter genérico no debería conocer `LoggerPort` — ese es un detalle de la capa de aplicación. La responsabilidad de pasar el logger al use case es de `composeLlmClient`.

### 5. `DiagnosisController` recibe `DiagnosisService`, no dependencias sueltas

**Elegido**: Constructor recibe `DiagnosisService` como única dependencia. Los métodos `diagnose`, `cognitiveDiagnosis` y `mcpTool` delegan al servicio y manejan solo HTTP (parseo con Zod, status codes, error responses).

```typescript
export class DiagnosisController {
  constructor(private readonly service: DiagnosisService) {}
}
```

`listScenarios` también delega al servicio, eliminando el `TCP_DIRECT_SCENARIO` hardcodeado del controlador.

**Razón**: Consistente con `AuthController` que recibe objetos ya construidos. El controlador pasa de ~270 a ~120 líneas.

## Data Model

### `DiagnosisService`

```typescript
export class DiagnosisService {
  constructor(
    private readonly scenarios: SimulationScenario[],
    private readonly obdRepo: ObdRepository | undefined,
    private readonly llmClient: LlmClientPort | undefined,
    private readonly logger: LoggerPort,
  ) {}

  listScenarios(): SimulationScenario[]

  async diagnose(scenarioId?: string): Promise<{
    rawData: string
    parsedValues: LiveData
    dtcCodes: DtcCode[]
    diagnosisText: string
    severity: Severity
  }>

  async cognitiveDiagnosis(input: {
    scenarioId?: string
    userQuery?: string
  }): Promise<ExecuteCognitiveDiagnosisOutput>

  async callMcpTool(
    toolName: string,
    scenarioId?: string,
    args?: Record<string, unknown>,
  ): Promise<string>
}
```

### `DiagnosisController` resultante (~120 líneas)

```typescript
export class DiagnosisController {
  constructor(private readonly service: DiagnosisService) {}

  listScenarios = (_req: Request, res: Response): void => { ... }
  diagnose = async (req: Request, res: Response): Promise<void> => { ... }
  mcpTool = async (req: Request, res: Response): Promise<void> => { ... }
  cognitiveDiagnosis = async (req: Request, res: Response): Promise<void> => { ... }

  // Métodos privados de parseo HTTP — sin lógica de negocio
  private handleToolError(err, res, toolName)
  private handleCognitiveError(err, res)
  private parseDiagnosisBody(body) // Zod
  private parseCognitiveBody(body)  // Zod
}
```

### `ExecuteLlmToolCalling` con logger

```typescript
export class ExecuteLlmToolCalling {
  constructor(
    private readonly sendSingleMessage: LlmSingleMessageSender,
    maxIterations: number = DEFAULT_MAX_ITERATIONS,
    private readonly logger: LoggerPort,
  ) {}

  // console.error → this.logger.error
}
```

### Cadena de propagación del logger

```
composition.ts
  logger = new Logger(...)
  
  llmClient = createAnthropicClient({
    apiKey: ...,
    model: ...,
    logger,                    // ← nuevo
  })
    → composeLlmClient(sender, maxIter, logger)
      → new ExecuteLlmToolCalling(sender, maxIter, logger)
```

## Error Handling

| Error | Origen | HTTP Status |
|---|---|---|
| `DiagnosisScenarioNotFoundError` | `DiagnosisService.resolveRepository()` | 404 |
| `CognitiveDiagnosisUnavailableError` | `DiagnosisService.cognitiveDiagnosis()` | 404 |
| `ZodError` (invalid body) | `DiagnosisController` (Zod parse) | 400 |
| Tool not found | MCP server → `DiagnosisService` | 404 |
| Timeout | `DiagnosisService` (via `withTimeout`) | 504 |
| `MaxToolCallIterationsError` | `ExecuteLlmToolCalling` | 500 |
| Unknown errors | Controller catch-all | 500 |

Los errores tipados (`DiagnosisScenarioNotFoundError`, `CognitiveDiagnosisUnavailableError`) se definen en `infrastructure/services/diagnosisService.ts` (errores de infraestructura, no de dominio — son detalles de la resolución de dependencias).

## Risks / Trade-offs

- [`DiagnosisService` es un nuevo archivo en infrastructure] → Riesgo bajo: el patrón ya existe (`authService.ts`). Los tests del controlador se adaptan mockeando el servicio en vez de mockear repositorios.
- [Logger en `AnthropicClientConfig`/`OpenAiClientConfig` es opcional] → Aceptable: los tests existentes que crean clientes sin logger no se rompen. Solo `composition.ts` lo provee en producción.
- [El controlador pierde ~150 líneas] → Bajo riesgo: lógica movida, no eliminada. Tests existentes cubren el comportamiento end-to-end.
