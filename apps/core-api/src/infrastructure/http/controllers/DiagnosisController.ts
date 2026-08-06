import type { Request, Response } from 'express'
import { z } from 'zod'
import {
  DiagnosisService,
  DiagnosisScenarioNotFoundError,
  CognitiveDiagnosisUnavailableError,
  ToolNotFoundError,
  ToolCallTimeoutError,
  CognitiveDiagnosisTimeoutError,
} from '@/infrastructure/services/diagnosisService.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'

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

/** Campo scenarioId: requerido en modo simulacion, opcional en modo TCP directo. */
function scenarioIdField(required: boolean): z.ZodType<string | undefined> {
  return required
    ? z.string().min(1, 'scenarioId is required')
    : z.string().min(1).optional()
}

const DiagnosisBodySchema = z.object({ scenarioId: scenarioIdField(true) })
const DiagnosisBodyTcpSchema = z.object({ scenarioId: scenarioIdField(false) })

const McpToolBodySchema = z.object({
  scenarioId: scenarioIdField(true),
  args: z.record(z.unknown()).default({}),
})
const McpToolBodyTcpSchema = z.object({
  scenarioId: scenarioIdField(false),
  args: z.record(z.unknown()).default({}),
})

const McpToolParamsSchema = z.object({
  toolName: z.string().min(1),
})

const CognitiveDiagnosisBodySchema = z.object({
  scenarioId: scenarioIdField(true),
  query: z.string().optional(),
})
const CognitiveDiagnosisBodyTcpSchema = z.object({
  scenarioId: scenarioIdField(false),
  query: z.string().optional(),
})

/** Controlador HTTP para los endpoints de diagnostico OBD. */
export class DiagnosisController {
  constructor(
    private readonly service: DiagnosisService,
    private readonly logger: LoggerPort,
  ) {}

  listScenarios = (_req: Request, res: Response): void => {
    res.status(200).json({ scenarios: this.service.listScenarios() })
  }

  diagnose = async (req: Request, res: Response): Promise<void> => {
    const schema = this.selectBodySchema(DiagnosisBodySchema, DiagnosisBodyTcpSchema)
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: ERROR_MESSAGES.invalidBody, details: parsed.error.issues })
      return
    }

    try {
      const result = await this.service.diagnose(parsed.data.scenarioId)
      res.status(200).json(result)
    } catch (err) {
      if (err instanceof DiagnosisScenarioNotFoundError) {
        res.status(404).json({ error: ERROR_MESSAGES.scenarioNotFound })
        return
      }
      this.logger.error(
        `[ERROR] Diagnosis failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      )
      res.status(500).json({ error: ERROR_MESSAGES.internalError })
    }
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
    const bodySchema = this.selectBodySchema(McpToolBodySchema, McpToolBodyTcpSchema)
    const parsed = bodySchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: ERROR_MESSAGES.invalidBody, details: parsed.error.issues })
      return
    }

    try {
      const result = await this.service.callMcpTool(toolName, parsed.data.scenarioId, parsed.data.args)
      res.status(200).json({ tool: toolName, result })
    } catch (err) {
      this.handleToolError(err, res)
    }
  }

  cognitiveDiagnosis = async (req: Request, res: Response): Promise<void> => {
    const bodySchema = this.selectBodySchema(
      CognitiveDiagnosisBodySchema,
      CognitiveDiagnosisBodyTcpSchema,
    )
    const parsed = bodySchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: ERROR_MESSAGES.invalidBody, details: parsed.error.issues })
      return
    }

    try {
      const result = await this.service.cognitiveDiagnosis({
        scenarioId: parsed.data.scenarioId,
        userQuery: parsed.data.query,
      })
      res.status(200).json(result)
    } catch (err) {
      this.handleCognitiveError(err, res)
    }
  }

  private selectBodySchema<T>(required: z.ZodType<T>, optional: z.ZodType<T>): z.ZodType<T> {
    return this.service.isDirectConnection ? optional : required
  }

  private handleToolError(err: unknown, res: Response): void {
    if (err instanceof ToolNotFoundError) {
      res.status(404).json({ error: `${ERROR_MESSAGES.toolNotFound}: ${err.toolName}` })
      return
    }
    if (err instanceof ToolCallTimeoutError) {
      res.status(504).json({ error: ERROR_MESSAGES.toolTimedOut })
      return
    }
    this.logger.error(
      `[ERROR] MCP tool call failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
    )
    res.status(500).json({ error: ERROR_MESSAGES.internalError })
  }

  private handleCognitiveError(err: unknown, res: Response): void {
    if (err instanceof CognitiveDiagnosisUnavailableError) {
      res.status(404).json({ error: ERROR_MESSAGES.cognitiveUnavailable })
      return
    }
    if (err instanceof DiagnosisScenarioNotFoundError) {
      res.status(404).json({ error: ERROR_MESSAGES.scenarioNotFound })
      return
    }
    if (err instanceof CognitiveDiagnosisTimeoutError) {
      res.status(504).json({ error: ERROR_MESSAGES.cognitiveTimedOut })
      return
    }
    this.logger.error(
      `[ERROR] Cognitive diagnosis failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
    )
    res.status(500).json({ error: ERROR_MESSAGES.internalError })
  }
}
