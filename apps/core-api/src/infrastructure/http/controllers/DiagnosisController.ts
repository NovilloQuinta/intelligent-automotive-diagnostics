import type { Request, Response } from 'express'
import { z } from 'zod'
import { ObdSimulator } from '@/infrastructure/simulation/simulator.js'
import { ObdSimulatorRepository } from '@/infrastructure/simulation/simulatorAdapter.js'
import {
  ProcessVehicleDiagnosisUseCase,
  DIAGNOSIS_TIMEOUT_MS,
  withTimeout,
} from '@/application/use-cases/ProcessVehicleDiagnosisUseCase.js'
import { ExecuteCognitiveDiagnosisUseCase } from '@/application/use-cases/ExecuteCognitiveDiagnosisUseCase.js'
import { createMcpServer } from '@/infrastructure/mcp/mcpServer.js'
import type { ObdRepository } from '@/application/ports/ObdRepository.js'
import type { LlmClientPort } from '@/application/ports/LlmClientPort.js'
import type { ToolCallHandler } from '@/application/ports/ToolCallHandler.js'
import type { DiagnosisResult } from '@/domain/value-objects/diagnosisResult.js'
import type { ExecuteCognitiveDiagnosisOutput } from '@/application/dto/ExecuteCognitiveDiagnosisOutput.js'
import { Vin, FALLBACK_VIN } from '@/domain/value-objects/vin.js'
import { VehicleType } from '@/infrastructure/simulation/scenario.js'
import type { SimulationScenario } from '@/infrastructure/simulation/scenario.js'

const COGNITIVE_DIAGNOSIS_TIMEOUT_MS = 60_000

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

const CognitiveDiagnosisBodyTcpSchema = z.object({
  scenarioId: z.string().min(1).optional(),
  query: z.string().optional(),
})

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

/** Dependencias del controlador de diagnostico OBD. */
export interface DiagnosisControllerDeps {
  readonly scenarios: SimulationScenario[]
  readonly obdRepo?: ObdRepository
  readonly llmClient?: LlmClientPort
  readonly cognitiveTimeoutMs?: number
}

/** Controlador HTTP para los endpoints de diagnostico OBD. */
export class DiagnosisController {
  private readonly deps: DiagnosisControllerDeps

  constructor(deps: DiagnosisControllerDeps) {
    this.deps = deps
  }

  listScenarios = (_req: Request, res: Response): void => {
    const list = this.deps.obdRepo ? [TCP_DIRECT_SCENARIO] : this.deps.scenarios
    res.status(200).json({ scenarios: list })
  }

  diagnose = async (req: Request, res: Response): Promise<void> => {
    const schema = this.deps.obdRepo ? DiagnosisBodyTcpSchema : DiagnosisBodySchema
    const resolved = this.parseBodyAndResolve(res, req.body, schema)
    if (!resolved) return

    const useCase = new ProcessVehicleDiagnosisUseCase(resolved.repository)
    const result = await useCase.execute()
    res.status(200).json({
      rawData: JSON.stringify(result.parsedValues),
      parsedValues: result.parsedValues,
      dtcCodes: result.dtcCodes,
      diagnosisText: this.buildDiagnosisText(result),
      severity: result.severity,
    })
  }

  mcpTool = async (req: Request<{ toolName: string }>, res: Response): Promise<void> => {
    const paramsParsed = McpToolParamsSchema.safeParse(req.params)
    if (!paramsParsed.success) {
      res
        .status(400)
        .json({ error: ERROR_MESSAGES.invalidToolName, details: paramsParsed.error.issues })
      return
    }

    const { toolName } = paramsParsed.data
    const bodySchema = this.deps.obdRepo ? McpToolBodyTcpSchema : McpToolBodySchema
    const resolved = this.parseBodyAndResolve(res, req.body, bodySchema)
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
      this.handleToolError(err, res, toolName)
    }
  }

  cognitiveDiagnosis = async (req: Request, res: Response): Promise<void> => {
    const { llmClient } = this.deps
    if (!llmClient) {
      res.status(404).json({ error: ERROR_MESSAGES.cognitiveUnavailable })
      return
    }

    const bodySchema = this.deps.obdRepo
      ? CognitiveDiagnosisBodyTcpSchema
      : CognitiveDiagnosisBodySchema
    const resolved = this.parseBodyAndResolve(res, req.body, bodySchema)
    if (!resolved) return

    const mcp = createMcpServer(resolved.repository)
    const tools = mcp.listTools()
    const handler: ToolCallHandler = async (name, args) => {
      const result = await mcp.callTool(name, args)
      return result.content[0].text
    }

    try {
      const result = await this.runCognitiveDiagnosis({
        repository: resolved.repository,
        llmClient,
        tools,
        handler,
        userQuery: resolved.data.query,
      })
      res.status(200).json(result)
    } catch (err) {
      this.handleCognitiveError(err, res)
    }
  }

  private parseBodyAndResolve<T extends { scenarioId?: string }>(
    res: Response,
    body: unknown,
    schema: {
      safeParse: (
        data: unknown,
      ) => { success: true; data: T } | { success: false; error: { issues: unknown[] } }
    },
  ): { repository: ObdRepository; data: T } | null {
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      res.status(400).json({ error: ERROR_MESSAGES.invalidBody, details: parsed.error.issues })
      return null
    }
    const repository = this.resolveRepository(parsed.data.scenarioId)
    if (!repository) {
      res.status(404).json({ error: ERROR_MESSAGES.scenarioNotFound })
      return null
    }
    return { repository, data: parsed.data }
  }

  private resolveRepository(scenarioId?: string): ObdRepository | null {
    if (this.deps.obdRepo) return this.deps.obdRepo
    const scenario = this.deps.scenarios.find((s) => s.id === scenarioId)
    return scenario ? new ObdSimulatorRepository(new ObdSimulator(scenario)) : null
  }

  private handleToolError(err: unknown, res: Response, toolName: string): void {
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

  private handleCognitiveError(err: unknown, res: Response): void {
    const message = err instanceof Error ? err.message : 'Unknown error'
    if (message.includes(ERROR_MESSAGES.cognitiveTimedOut)) {
      res.status(504).json({ error: ERROR_MESSAGES.cognitiveTimedOut })
    } else {
      console.error(`[ERROR] Cognitive diagnosis failed: ${message}`)
      res.status(500).json({ error: ERROR_MESSAGES.internalError })
    }
  }

  private async runCognitiveDiagnosis(params: {
    repository: ObdRepository
    llmClient: LlmClientPort
    tools: ReturnType<ReturnType<typeof createMcpServer>['listTools']>
    handler: ToolCallHandler
    userQuery?: string
  }): Promise<ExecuteCognitiveDiagnosisOutput> {
    const diagnosis = (async () => {
      const vehicleContext = await params.repository.getVehicleInfo()
      const useCase = new ExecuteCognitiveDiagnosisUseCase(
        params.llmClient,
        params.tools,
        params.handler,
      )
      return useCase.execute({
        userQuery: params.userQuery,
        vehicleContext,
      })
    })()

    return withTimeout(
      diagnosis,
      this.deps.cognitiveTimeoutMs ?? COGNITIVE_DIAGNOSIS_TIMEOUT_MS,
      ERROR_MESSAGES.cognitiveTimedOut,
    )
  }

  private buildDiagnosisText(result: DiagnosisResult): string {
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
}
