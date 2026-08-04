import { Router } from 'express'
import type { Request, Response } from 'express'
import { z } from 'zod'
import { ObdSimulator } from '@/infrastructure/obd/simulator.js'
import { ObdSimulatorRepository } from '@/infrastructure/obd/simulatorAdapter.js'
import { ProcessVehicleDiagnosisUseCase, DIAGNOSIS_TIMEOUT_MS, withTimeout } from '@/application/use-cases/ProcessVehicleDiagnosisUseCase.js'
import type { ExecuteCognitiveDiagnosisOutput } from '@/application/dto/ExecuteCognitiveDiagnosisOutput.js'
import type { DiagnosisResult } from '@/domain/value-objects/diagnosisResult.js'
import { ExecuteCognitiveDiagnosisUseCase } from '@/application/use-cases/ExecuteCognitiveDiagnosisUseCase.js'
import { createMcpServer } from '@/infrastructure/mcp/mcpServer.js'
import type { ObdRepository } from '@/application/ports/ObdRepository.js'
import type { LlmClientPort } from '@/application/ports/LlmClientPort.js'
import type { ToolCallHandler } from '@/application/ports/ToolCallHandler.js'
import { Vin, FALLBACK_VIN } from '@/domain/value-objects/vin.js'
import { VehicleType } from '@/infrastructure/obd/simulationScenario.js'
import type { SimulationScenario } from '@/infrastructure/obd/simulationScenario.js'


/** Timeout del diagnóstico cognitivo: el bucle de tool calling puede durar varias llamadas API. */
export const COGNITIVE_DIAGNOSIS_TIMEOUT_MS = 60_000

/** Mensajes de error compartidos por los handlers de diagnóstico (sin magic strings). */
const ERROR_MESSAGES = {
  scenarioNotFound: 'Scenario not found',
  invalidBody: 'Invalid request body',
  invalidToolName: 'Invalid tool name',
  toolNotFound: 'Tool not found',
  toolTimedOut: 'Tool call timed out',
  cognitiveTimedOut: 'Cognitive diagnosis timed out',
  cognitiveUnavailable: 'Cognitive diagnosis is not available',
  internalError: 'Internal server error',
} as const

const DiagnosisBodySchema = z.object({
  scenarioId: z.string().min(1, 'scenarioId is required'),
})

/** En modo TCP no se requiere scenarioId (el repo habla con el emulador directamente). */
const DiagnosisBodyTcpSchema = z.object({
  scenarioId: z.string().min(1).optional(),
})

const McpToolBodySchema = z.object({
  scenarioId: z.string().min(1, 'scenarioId is required'),
  args: z.record(z.unknown()).default({}),
})

const McpToolBodyTcpSchema = z.object({
  scenarioId: z.string().min(1).optional(),
  args: z.record(z.unknown()).default({}),
})

const McpToolParamsSchema = z.object({
  toolName: z.string().min(1),
})

const CognitiveDiagnosisBodySchema = z.object({
  scenarioId: z.string().min(1, 'scenarioId is required'),
  query: z.string().optional(),
})

/** En modo TCP no se requiere scenarioId (el repo habla con el emulador directamente). */
const CognitiveDiagnosisBodyTcpSchema = z.object({
  scenarioId: z.string().min(1).optional(),
  query: z.string().optional(),
})

/** Escenario sintético expuesto en GET /scenarios cuando OBD_MODE=tcp (solo UI). */
const TCP_DIRECT_SCENARIO: SimulationScenario = {
  id: 'tcp',
  name: 'ELM327 Direct Connection',
  vehicleType: VehicleType.Car,
  sensorValues: { rpm: 0, coolantTemp: 0, speed: 0, intakeTemp: 0 },
  dtcConfig: [],
  vehicleInfo: {
    make: 'unknown',
    model: 'unknown',
    year: 0,
    engineType: 'unknown',
    vin: new Vin(FALLBACK_VIN),
  },
}

interface DiagnosisRoutesDeps {
  readonly scenarios: SimulationScenario[]
  readonly obdRepo?: ObdRepository
  /** Cliente LLM opcional: si no se inyecta, el endpoint cognitivo no se monta. */
  readonly llmClient?: LlmClientPort
  /** Timeout del diagnóstico cognitivo en ms (default: {@link COGNITIVE_DIAGNOSIS_TIMEOUT_MS}). */
  readonly cognitiveTimeoutMs?: number
}

/** Parsea body + resuelve repo. Responde 400/404 y retorna null si falla. */
function parseBodyAndResolve<T extends { scenarioId?: string }>(
  deps: DiagnosisRoutesDeps,
  res: Response,
  body: unknown,
  schema: { safeParse: (data: unknown) => { success: true; data: T } | { success: false; error: { issues: unknown[] } } },
): { repository: ObdRepository; data: T } | null {
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    res.status(400).json({ error: ERROR_MESSAGES.invalidBody, details: parsed.error.issues })
    return null
  }
  const repository = resolveRepository(deps, parsed.data.scenarioId)
  if (!repository) {
    res.status(404).json({ error: ERROR_MESSAGES.scenarioNotFound })
    return null
  }
  return { repository, data: parsed.data }
}

/** Resuelve el repositorio OBD: TCP directo o simulador por scenarioId. Null si no hay escenario. */
function resolveRepository(
  deps: DiagnosisRoutesDeps,
  scenarioId?: string,
): ObdRepository | null {
  if (deps.obdRepo) return deps.obdRepo
  const scenario = deps.scenarios.find((s) => s.id === scenarioId)
  return scenario ? new ObdSimulatorRepository(new ObdSimulator(scenario)) : null
}

/** GET /scenarios — lista escenarios (sintetico "tcp" en modo TCP). */
function listScenariosHandler(deps: DiagnosisRoutesDeps) {
  return (_req: Request, res: Response): void => {
    const list = deps.obdRepo ? [TCP_DIRECT_SCENARIO] : deps.scenarios
    res.status(200).json({ scenarios: list })
  }
}

/** POST /diagnosis — diagnostico via escenario simulado o emulador TCP directo. */
function createDiagnosisHandler(deps: DiagnosisRoutesDeps) {
  return async (req: Request, res: Response): Promise<void> => {
    const schema = deps.obdRepo ? DiagnosisBodyTcpSchema : DiagnosisBodySchema
    const resolved = parseBodyAndResolve(deps, res, req.body, schema)
    if (!resolved) return

    const useCase = new ProcessVehicleDiagnosisUseCase(resolved.repository)
    const result = await useCase.execute()
    res.status(200).json({
      rawData: JSON.stringify(result.parsedValues),
      parsedValues: result.parsedValues,
      dtcCodes: result.dtcCodes,
      diagnosisText: buildDiagnosisText(result),
      severity: result.severity,
    })
  }
}

/** Mapea un error de tool call MCP a una respuesta HTTP. */
function handleToolError(err: unknown, res: Response, toolName: string): void {
  const message = err instanceof Error ? err.message : 'Unknown error'
  if (message.includes(ERROR_MESSAGES.toolNotFound)) {
    res.status(404).json({ error: `${ERROR_MESSAGES.toolNotFound}: ${toolName}` })
  } else if (message.includes(ERROR_MESSAGES.toolTimedOut)) {
    res.status(504).json({ error: ERROR_MESSAGES.toolTimedOut })
  } else {
    console.error(`[ERROR] MCP tool call failed: ${message}`)
    res.status(500).json({ error: ERROR_MESSAGES.internalError })
  }
}

/** POST /mcp/tools/:toolName — invoca una herramienta MCP contra el repo OBD. */
function createMcpToolHandler(deps: DiagnosisRoutesDeps) {
  return async (req: Request<{ toolName: string }>, res: Response): Promise<void> => {
    const paramsParsed = McpToolParamsSchema.safeParse(req.params)
    if (!paramsParsed.success) {
      res
        .status(400)
        .json({ error: ERROR_MESSAGES.invalidToolName, details: paramsParsed.error.issues })
      return
    }

    const { toolName } = paramsParsed.data
    const bodySchema = deps.obdRepo ? McpToolBodyTcpSchema : McpToolBodySchema
    const resolved = parseBodyAndResolve(deps, res, req.body, bodySchema)
    if (!resolved) return

    const mcp = createMcpServer(resolved.repository)
    try {
      const result = await withTimeout(
        mcp.callTool(toolName, resolved.data.args),
        DIAGNOSIS_TIMEOUT_MS,
        ERROR_MESSAGES.toolTimedOut,
      )
      res.status(200).json({ tool: toolName, result: result.content[0].text })
    } catch (err) {
      handleToolError(err, res, toolName)
    }
  }
}

/** Mapea errores del diagnóstico cognitivo a respuestas HTTP (sin filtrar detalles internos). */
function handleCognitiveError(err: unknown, res: Response): void {
  const message = err instanceof Error ? err.message : 'Unknown error'
  if (message.includes(ERROR_MESSAGES.cognitiveTimedOut)) {
    res.status(504).json({ error: ERROR_MESSAGES.cognitiveTimedOut })
  } else {
    console.error(`[ERROR] Cognitive diagnosis failed: ${message}`)
    res.status(500).json({ error: ERROR_MESSAGES.internalError })
  }
}

/** POST /mcp/cognitive-diagnosis — diagnóstico cognitivo LLM vía MCP tool calling. */
function createCognitiveDiagnosisHandler(deps: DiagnosisRoutesDeps) {
  return async (req: Request, res: Response): Promise<void> => {
    const { llmClient } = deps
    if (!llmClient) {
      res.status(404).json({ error: ERROR_MESSAGES.cognitiveUnavailable })
      return
    }

    const bodySchema = deps.obdRepo ? CognitiveDiagnosisBodyTcpSchema : CognitiveDiagnosisBodySchema
    const resolved = parseBodyAndResolve(deps, res, req.body, bodySchema)
    if (!resolved) return

    // Bridge in-process: el LLM llama a las tools MCP sin transporte (design.md decision 3)
    const mcp = createMcpServer(resolved.repository)
    const tools = mcp.listTools()
    const handler: ToolCallHandler = async (name, args) => {
      const result = await mcp.callTool(name, args)
      return result.content[0].text
    }

    try {
      const result = await runCognitiveDiagnosis({
        repository: resolved.repository,
        llmClient,
        tools,
        handler,
        userQuery: resolved.data.query,
        timeoutMs: deps.cognitiveTimeoutMs ?? COGNITIVE_DIAGNOSIS_TIMEOUT_MS,
      })
      res.status(200).json(result)
    } catch (err) {
      handleCognitiveError(err, res)
    }
  }
}

/** Ejecuta diagnóstico cognitivo con timeout. Extraído del handler para reducir nesting. */
async function runCognitiveDiagnosis(params: {
  repository: ObdRepository
  llmClient: LlmClientPort
  tools: ReturnType<ReturnType<typeof createMcpServer>['listTools']>
  handler: ToolCallHandler
  userQuery?: string
  timeoutMs: number
}): Promise<ExecuteCognitiveDiagnosisOutput> {
  const diagnosis = (async () => {
    const vehicleContext = await params.repository.getVehicleInfo()
    const useCase = new ExecuteCognitiveDiagnosisUseCase(params.llmClient, params.tools, params.handler)
    return useCase.execute({
      userQuery: params.userQuery,
      vehicleContext,
    })
  })()

  return withTimeout(diagnosis, params.timeoutMs, ERROR_MESSAGES.cognitiveTimedOut)
}

/** Construye el texto legible del diagnóstico. Presentación, solo en el borde HTTP. */
function buildDiagnosisText(result: DiagnosisResult): string {
  const description =
    result.dtcCodes.length > 0
      ? result.dtcCodes.map((d) => d.code).join(', ')
      : 'No fault codes detected'

  const base = `[${result.severity.toUpperCase()}] ${description}`
  if (result.freezeFrame) {
    const freezeKeys = result.freezeFrame.pidKeys.join(', ')
    return `${base} (freeze frame: ${result.freezeFrame.dtcCode} → ${freezeKeys})`
  }
  return base
}

/** Crea un Express Router con las rutas de diagnostico OBD. */
export function createDiagnosisRoutes(deps: DiagnosisRoutesDeps): Router {
  const router = Router()

  router.get('/scenarios', listScenariosHandler(deps))
  router.post('/diagnosis', createDiagnosisHandler(deps))
  router.post('/mcp/tools/:toolName', createMcpToolHandler(deps))
  if (deps.llmClient) {
    router.post('/mcp/cognitive-diagnosis', createCognitiveDiagnosisHandler(deps))
  }

  return router
}
