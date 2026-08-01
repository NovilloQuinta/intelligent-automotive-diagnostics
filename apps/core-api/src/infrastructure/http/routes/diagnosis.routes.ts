import { Router } from 'express'
import type { Request, Response } from 'express'
import { z } from 'zod'
import { ObdSimulator } from '@/infrastructure/obd/simulator.js'
import { ObdSimulatorRepository } from '@/infrastructure/obd/simulatorAdapter.js'
import { processVehicleDiagnosis } from '@/application/use-cases/processVehicleDiagnosis.js'
import { executeCognitiveDiagnosis } from '@/application/use-cases/executeCognitiveDiagnosis.js'
import { createMcpServer } from '@/infrastructure/mcp/mcpServer.js'
import type { ObdRepositoryPort } from '@/application/ports/obdRepository.port.js'
import type { LlmClientPort, ToolCallHandler } from '@/application/ports/llmClient.port.js'
import { Vin } from '@/domain/vin.js'
import { VehicleType } from '@/domain/simulationScenario.js'
import type { SimulationScenario } from '@/domain/simulationScenario.js'

const DIAGNOSIS_TIMEOUT_MS = 10_000

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
    vin: Vin.create('XXXXXXXXXXXXXXXXX'),
  },
}

interface DiagnosisRoutesDeps {
  readonly scenarios: SimulationScenario[]
  readonly obdRepo?: ObdRepositoryPort
  /** Cliente LLM opcional: si no se inyecta, el endpoint cognitivo no se monta. */
  readonly llmClient?: LlmClientPort
  /** Timeout del diagnóstico cognitivo en ms (default: {@link COGNITIVE_DIAGNOSIS_TIMEOUT_MS}). */
  readonly cognitiveTimeoutMs?: number
}

/** Resuelve el repositorio OBD: TCP directo o simulador por scenarioId. Null si no hay escenario. */
function resolveRepository(
  deps: DiagnosisRoutesDeps,
  scenarioId?: string,
): ObdRepositoryPort | null {
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
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: ERROR_MESSAGES.invalidBody, details: parsed.error.issues })
      return
    }

    const repository = resolveRepository(deps, parsed.data.scenarioId)
    if (!repository) {
      res.status(404).json({ error: ERROR_MESSAGES.scenarioNotFound })
      return
    }

    const result = await processVehicleDiagnosis(repository)
    res.status(200).json(result)
  }
}

/** Mapea un error de tool call MCP a una respuesta HTTP. */
function handleToolError(err: unknown, res: Response, toolName: string): void {
  const message = err instanceof Error ? err.message : 'Unknown error'
  if (message.includes(ERROR_MESSAGES.toolNotFound)) {
    res.status(404).json({ error: `${ERROR_MESSAGES.toolNotFound}: ${toolName}` })
  } else if (message.includes('Timed out')) {
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
      res.status(400).json({ error: ERROR_MESSAGES.invalidToolName, details: paramsParsed.error.issues })
      return
    }

    const bodySchema = deps.obdRepo ? McpToolBodyTcpSchema : McpToolBodySchema
    const bodyParsed = bodySchema.safeParse(req.body)
    if (!bodyParsed.success) {
      res.status(400).json({ error: ERROR_MESSAGES.invalidBody, details: bodyParsed.error.issues })
      return
    }

    const { toolName } = paramsParsed.data
    const repository = resolveRepository(deps, bodyParsed.data.scenarioId)
    if (!repository) {
      res.status(404).json({ error: ERROR_MESSAGES.scenarioNotFound })
      return
    }

    const mcp = createMcpServer(repository)
    try {
      const result = await Promise.race([
        mcp.callTool(toolName, bodyParsed.data.args),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(ERROR_MESSAGES.toolTimedOut)), DIAGNOSIS_TIMEOUT_MS),
        ),
      ])
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
    const bodyParsed = bodySchema.safeParse(req.body)
    if (!bodyParsed.success) {
      res.status(400).json({ error: ERROR_MESSAGES.invalidBody, details: bodyParsed.error.issues })
      return
    }

    const repository = resolveRepository(deps, bodyParsed.data.scenarioId)
    if (!repository) {
      res.status(404).json({ error: ERROR_MESSAGES.scenarioNotFound })
      return
    }

    // Bridge in-process: el LLM llama a las tools MCP sin transporte (design.md decision 3)
    const mcp = createMcpServer(repository)
    const tools = mcp.listTools()
    const handler: ToolCallHandler = async (name, args) => {
      const result = await mcp.callTool(name, args)
      return result.content[0].text
    }

    try {
      const result = await Promise.race([
        (async () => {
          const vehicleContext = await repository.getVehicleInfo()
          return executeCognitiveDiagnosis({
            llmClient,
            tools,
            handler,
            userQuery: bodyParsed.data.query,
            vehicleContext,
          })
        })(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(ERROR_MESSAGES.cognitiveTimedOut)),
            deps.cognitiveTimeoutMs ?? COGNITIVE_DIAGNOSIS_TIMEOUT_MS,
          ),
        ),
      ])
      res.status(200).json(result)
    } catch (err) {
      handleCognitiveError(err, res)
    }
  }
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
