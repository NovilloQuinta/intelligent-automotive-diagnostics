## Context

Fase 4 del TFM. Stack: TypeScript ESM strict, Express 5, Clean Architecture, Vitest. Existe el puerto `LlmClientPort` (`application/ports/llmClient.port.ts`) con `sendMessage(input: LlmMessageInput): Promise<LlmResponse>` que gestiona el bucle de tool calling (máximo 10 iteraciones, timeout 30s, errores sanitizados OWASP A09). Lo implementan `createAnthropicClient` y `createOpenAiClient`. El MCP Server (`infrastructure/mcp/mcpServer.ts`) expone 6 tools OBD y ofrece `callTool(name, args)` in-process, testeable sin transporte. El tipo `CognitiveDiagnosisResult` (diagnosis, severity, confidence, recommendations, toolCalls) ya está definido en `infrastructure/mcp/cognitiveDiagnosisResult.ts`.

Lo que falta es el pegamento: un use case en `application/` que construya las tool definitions, conecte el handler hacia el MCP Server, invoque al LLM y estructure la respuesta. El endpoint documentado `POST /api/mcp/cognitive-diagnosis` no existe.

## Goals / Non-Goals

**Goals:**
- Implementar `executeCognitiveDiagnosis` en `application/use-cases/` (capa de aplicación, sin imports de infraestructura).
- Endpoint `POST /api/mcp/cognitive-diagnosis` que devuelve `CognitiveDiagnosisResult` completo con traza de tools.
- Reutilizar las 6 tools MCP existentes sin duplicar sus definiciones.
- Instanciación del LLM client en `main.ts` según `LLM_PROVIDER` (env vars ya documentadas).
- TDD estricto: RED (mocks de `LlmClientPort` y `ObdRepositoryPort`) → GREEN → REFACTOR.

**Non-Goals:**
- No implementa transporte MCP (stdio/SSE) — el LLM llama a `callTool` in-process.
- No añade tools nuevas (las 6 existentes son suficientes; las tools LanceDB son otra fase, ADR 007).
- No persiste sesiones de diagnóstico cognitivo (fuera de alcance).
- No introduce sistema de prompts externos/editable — el system prompt es una constante interna.

## Decisions

### 1. System prompt como constante interna del use case

**Elegido**: Constante `COGNITIVE_DIAGNOSIS_SYSTEM_PROMPT` dentro del use case. Instruye al LLM a actuar como diagnosticador automotriz experto, usar las tools para explorar datos, razonar causas raíz cruzando síntomas + DTCs + freeze frame, y devolver un diagnóstico narrativo en español seguido de un bloque `---JSON---` con `{ severity, confidence, recommendations }`.

**Rechazado**: Prompt en un archivo separado/editable. Añade indirección sin beneficio para el TFM; el prompt es parte de la lógica del caso de uso.

### 2. Tool definitions y handler construidos desde el McpServer (sin duplicación)

**Elegido**: El use case recibe un objeto `ToolBridge` (nombre, descripción, schema, `execute(name, args)`). La capa de infraestructura (route) construye este puente a partir de `createMcpServer(...)`, evitando duplicar las definiciones de las 6 tools en el use case. Alternativa si no se quiere acoplar: el use case recibe directamente el `DiagnosticsMcpServer` y extrae tools vía método `listTools()` — ver decisión 3.

**Rechazado**: Re-declarar las 6 tools en el use case. Duplicaría la fuente de verdad (`mcpServer.ts`) y rompería DRY.

### 3. Bridge in-process: handler → callTool

**Elegido**: `ToolCallHandler` del puerto LLM llama a `mcpServer.callTool(name, args)` y extrae `result.content[0].text` como string de retorno. Es la conexión directa entre el bucle de tool calling del LLM y las tools MCP, sin transporte. Para obtener las definiciones de tools, el McpServer expone `listTools(): McpToolDefinition[]` (nuevo método, extraído del registro de handlers existente).

**Rechazado**: Transporte MCP real (stdio). Complejidad innecesaria para un proceso único; el protocolo ya queda demostrado con el patrón Port/Adapter.

### 4. Parseo del resultado: bloque `---JSON---` con fallback

**Elegido**: El LLM devuelve narrativa + bloque JSON delimitado. El use case extrae el JSON (regex `---JSON---([\s\S]*?)---`), lo valida con Zod (`Severity` enum, `confidence` 0-1, `recommendations` array de strings). Si el bloque falta o es inválido → fallback `Severity.Medium`, `confidence: 0.5`, `recommendations: []`, manteniendo la narrativa completa.

**Rechazado**: Forzar salida JSON pura. La narrativa legible es el entregable principal para el mecánico; el JSON estructurado es metadata complementaria.

### 5. Timeout de 60s en la ruta (vs 10s determinista)

**Elegido**: `COGNITIVE_DIAGNOSIS_TIMEOUT_MS = 60_000` en la ruta, con `Promise.race` igual que el endpoint determinista. El LLM con tool calling puede tardar varias llamadas API.

**Rechazado**: Reusar el timeout de 10s. Insuficiente para el bucle de tool calling (el puerto ya tiene timeout de 30s por llamada).

### 6. `llmClient` opcional en ServerDependencies

**Elegido**: `llmClient?: LlmClientPort` en `ServerDependencies`; el endpoint cognitivo se monta solo si está presente (mismo patrón que `userRepo`/`authService`). Los tests de server existentes no se rompen.

**Rechazado**: LlmClient obligatorio. Forzaría configurar un LLM en tests que no lo usan.

## Data Model

### CognitiveDiagnosisResult (ya definido)

```typescript
interface CognitiveDiagnosisResult {
  diagnosis: string          // narrativa del LLM
  severity: Severity          // low | medium | high | critical
  confidence: number          // 0-1
  recommendations: string[]
  toolCalls: ToolCallTrace[]  // { tool, args, result }[]
}
```

### Flujo de ejecución

```
POST /api/mcp/cognitive-diagnosis { scenarioId, query? }
  → resolveRepository(scenarioId)  // simulador o TCP
  → createMcpServer(repo)          // 6 tools
  → executeCognitiveDiagnosis({
       llmClient,
       mcpServer,
       userQuery,
       vehicleContext,             // de repo.getVehicleInfo()
     })
       ├─ tools = mcpServer.listTools()
       ├─ handler = (name, args) => mcpServer.callTool(name, args).content[0].text
       ├─ { text, toolCalls } = llmClient.sendMessage({ systemPrompt, userMessage, tools, handler })
       ├─ parse ---JSON--- block → { severity, confidence, recommendations }
       └─ return CognitiveDiagnosisResult
  → 200 { diagnosis, severity, confidence, recommendations, toolCalls }
```
