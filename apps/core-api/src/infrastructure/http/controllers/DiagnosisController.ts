import type { Request, Response } from 'express'
import { z } from 'zod'
import { DiagnosisService } from '@/infrastructure/services/diagnosisService.js'
import {
  ToolCallTimeoutError,
  EmptyToolResultError,
  ToolNotFoundError,
} from '@/infrastructure/mcp/errors.js'
import {
  DiagnosisScenarioNotFoundError,
  CognitiveDiagnosisUnavailableError,
  CognitiveDiagnosisTimeoutError,
} from '@/infrastructure/services/errors.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import type { LlmConversationItem } from '@/application/dto/llm/LlmMessageInput.js'

const ERROR_MESSAGES = {
  scenarioNotFound: 'Scenario not found',
  invalidBody: 'Invalid request body',
  invalidToolName: 'Invalid tool name',
  toolNotFound: 'Tool not found',
  toolTimedOut: 'Tool call timed out',
  emptyToolResult: 'Tool returned no content',
  cognitiveTimedOut: 'Cognitive diagnosis timed out',
  cognitiveUnavailable: 'Cognitive diagnosis is not available',
  internalError: 'Internal server error',
} as const

/** scenarioId obligatorio: modo simulacion, donde hay que elegir escenario. */
const requiredScenarioId = z.string().min(1, 'scenarioId is required')

/** scenarioId opcional: modo TCP directo, donde solo hay un vehiculo conectado. */
const optionalScenarioId = z.string().min(1).optional()

const DiagnosisBodySchema = z.object({ scenarioId: requiredScenarioId })
const DiagnosisBodyTcpSchema = z.object({ scenarioId: optionalScenarioId })

const McpToolBodySchema = z.object({
  scenarioId: requiredScenarioId,
  args: z.record(z.unknown()).default({}),
})
const McpToolBodyTcpSchema = z.object({
  scenarioId: optionalScenarioId,
  args: z.record(z.unknown()).default({}),
})

const McpToolParamsSchema = z.object({
  toolName: z.string().min(1),
})

const LlmConversationItemSchema = z.discriminatedUnion('__type', [
  z.object({ __type: z.literal('user_message'), content: z.string() }),
  z.object({ __type: z.literal('raw_response'), data: z.unknown() }),
  z.object({
    __type: z.literal('tool_result'),
    toolCallId: z.string(),
    content: z.string(),
    isError: z.boolean(),
  }),
])

const CognitiveDiagnosisBodySchema = z.object({
  scenarioId: requiredScenarioId,
  query: z.string().optional(),
  history: z.array(LlmConversationItemSchema).optional(),
})
const CognitiveDiagnosisBodyTcpSchema = z.object({
  scenarioId: optionalScenarioId,
  query: z.string().optional(),
  history: z.array(LlmConversationItemSchema).optional(),
})

const FreezeFrameQuerySchema = z.object({
  scenarioId: requiredScenarioId,
  dtc: z.string().optional(),
})
const FreezeFrameQueryTcpSchema = z.object({
  scenarioId: optionalScenarioId,
  dtc: z.string().optional(),
})

const EcuInfoQuerySchema = z.object({
  scenarioId: requiredScenarioId,
})
const EcuInfoQueryTcpSchema = z.object({
  scenarioId: optionalScenarioId,
})

const VehicleInfoQuerySchema = z.object({
  scenarioId: requiredScenarioId,
})
const VehicleInfoQueryTcpSchema = z.object({
  scenarioId: optionalScenarioId,
})

const LiveDataQuerySchema = z.object({
  scenarioId: requiredScenarioId,
})
const LiveDataQueryTcpSchema = z.object({
  scenarioId: optionalScenarioId,
})

const ClearDtcBodySchema = z.object({ scenarioId: requiredScenarioId })
const ClearDtcBodyTcpSchema = z.object({ scenarioId: optionalScenarioId })

const PendingDtcQuerySchema = z.object({
  scenarioId: requiredScenarioId,
})
const PendingDtcQueryTcpSchema = z.object({
  scenarioId: optionalScenarioId,
})

const PermanentDtcQuerySchema = z.object({
  scenarioId: requiredScenarioId,
})
const PermanentDtcQueryTcpSchema = z.object({
  scenarioId: optionalScenarioId,
})

const VehicleStatusQuerySchema = z.object({
  scenarioId: requiredScenarioId,
})
const VehicleStatusQueryTcpSchema = z.object({
  scenarioId: optionalScenarioId,
})

/** Controlador HTTP para los endpoints de diagnostico OBD. */
export class DiagnosisController {
  constructor(
    private readonly service: DiagnosisService,
    private readonly logger: LoggerPort,
  ) {}

  /** GET /api/scenarios — lista los escenarios seleccionables. */
  listScenarios = (_req: Request, res: Response): void => {
    res.status(200).json({ scenarios: this.service.listScenarios() })
  }

  /** GET /api/mcp/capabilities — informa de las capacidades disponibles del servicio. */
  capabilities = (_req: Request, res: Response): void => {
    res.status(200).json({ cognitiveDiagnosis: this.service.hasCognitiveDiagnosis })
  }

  /** POST /api/diagnosis — diagnostico determinista. 400 body invalido, 404 escenario inexistente. */
  diagnose = async (req: Request, res: Response): Promise<void> => {
    const schema = this.selectSchema(DiagnosisBodySchema, DiagnosisBodyTcpSchema)
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: ERROR_MESSAGES.invalidBody, details: parsed.error.issues })
      return
    }

    try {
      const result = await this.service.diagnose(parsed.data.scenarioId)
      res.status(200).json(result)
    } catch (err) {
      if (this.respondIfCommonError(err, res)) return
      this.respondUnexpected(err, res, 'Diagnosis failed')
    }
  }

  /** POST /api/mcp/tools/:toolName — invoca una tool MCP. 404 no encontrada, 502 sin contenido, 504 timeout. */
  mcpTool = async (req: Request<{ toolName: string }>, res: Response): Promise<void> => {
    const paramsParsed = McpToolParamsSchema.safeParse(req.params)
    if (!paramsParsed.success) {
      res
        .status(400)
        .json({ error: ERROR_MESSAGES.invalidToolName, details: paramsParsed.error.issues })
      return
    }

    const { toolName } = paramsParsed.data
    const bodySchema = this.selectSchema(McpToolBodySchema, McpToolBodyTcpSchema)
    const parsed = bodySchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: ERROR_MESSAGES.invalidBody, details: parsed.error.issues })
      return
    }

    try {
      const result = await this.service.callMcpTool(
        toolName,
        parsed.data.scenarioId,
        parsed.data.args,
      )
      res.status(200).json({ tool: toolName, result })
    } catch (err) {
      this.handleToolError(err, res)
    }
  }

  /** POST /api/mcp/cognitive-diagnosis — diagnostico LLM. 404 sin LLM configurado, 504 timeout. */
  cognitiveDiagnosis = async (req: Request, res: Response): Promise<void> => {
    const bodySchema = this.selectSchema(
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
        conversationHistory: parsed.data.history as readonly LlmConversationItem[] | undefined,
      })
      res.status(200).json(result)
    } catch (err) {
      this.handleCognitiveError(err, res)
    }
  }

  /** GET /api/freeze-frame — freeze frame del DTC seleccionado. 400 query invalida, 404 escenario inexistente. */
  freezeFrame = async (req: Request, res: Response): Promise<void> => {
    const schema = this.selectSchema(FreezeFrameQuerySchema, FreezeFrameQueryTcpSchema)
    const parsed = schema.safeParse(req.query)
    if (!parsed.success) {
      res.status(400).json({ error: ERROR_MESSAGES.invalidBody, details: parsed.error.issues })
      return
    }

    try {
      const result = await this.service.getFreezeFrame(parsed.data.scenarioId, parsed.data.dtc)
      res.status(200).json({ freezeFrame: result })
    } catch (err) {
      if (this.respondIfCommonError(err, res)) return
      this.respondUnexpected(err, res, 'Freeze frame fetch failed')
    }
  }

  /** GET /api/ecu-info — ECUs descubiertas en el vehiculo. 400 query invalida, 404 escenario inexistente. */
  ecuInfo = async (req: Request, res: Response): Promise<void> => {
    const schema = this.selectSchema(EcuInfoQuerySchema, EcuInfoQueryTcpSchema)
    const parsed = schema.safeParse(req.query)
    if (!parsed.success) {
      res.status(400).json({ error: ERROR_MESSAGES.invalidBody, details: parsed.error.issues })
      return
    }

    try {
      const result = await this.service.getEcuInfo(parsed.data.scenarioId)
      res.status(200).json({ ecus: result })
    } catch (err) {
      if (this.respondIfCommonError(err, res)) return
      this.respondUnexpected(err, res, 'ECU info fetch failed')
    }
  }

  /** GET /api/vehicle-info — VIN y datos del vehiculo. 400 query invalida, 404 escenario inexistente. */
  vehicleInfo = async (req: Request, res: Response): Promise<void> => {
    const schema = this.selectSchema(VehicleInfoQuerySchema, VehicleInfoQueryTcpSchema)
    const parsed = schema.safeParse(req.query)
    if (!parsed.success) {
      res.status(400).json({ error: ERROR_MESSAGES.invalidBody, details: parsed.error.issues })
      return
    }

    try {
      const result = await this.service.getVehicleInfo(parsed.data.scenarioId)
      res.status(200).json(result)
    } catch (err) {
      if (this.respondIfCommonError(err, res)) return
      this.respondUnexpected(err, res, 'Vehicle info fetch failed')
    }
  }

  /** GET /api/live-data — telemetria en vivo de los 4 PIDs del dashboard. 400 query invalida, 404 escenario inexistente. */
  liveData = async (req: Request, res: Response): Promise<void> => {
    const schema = this.selectSchema(LiveDataQuerySchema, LiveDataQueryTcpSchema)
    const parsed = schema.safeParse(req.query)
    if (!parsed.success) {
      res.status(400).json({ error: ERROR_MESSAGES.invalidBody, details: parsed.error.issues })
      return
    }

    try {
      const result = await this.service.getLiveData(parsed.data.scenarioId)
      res.status(200).json(result)
    } catch (err) {
      if (this.respondIfCommonError(err, res)) return
      this.respondUnexpected(err, res, 'Live data fetch failed')
    }
  }

  /** POST /api/clear-dtc — borra DTCs almacenados (Mode 04). 400 body invalido, 404 escenario inexistente. */
  clearDtc = async (req: Request, res: Response): Promise<void> => {
    const schema = this.selectSchema(ClearDtcBodySchema, ClearDtcBodyTcpSchema)
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: ERROR_MESSAGES.invalidBody, details: parsed.error.issues })
      return
    }

    try {
      await this.service.clearDtcCodes(parsed.data.scenarioId)
      res.status(200).json({ cleared: true })
    } catch (err) {
      if (this.respondIfCommonError(err, res)) return
      this.respondUnexpected(err, res, 'Clear DTC failed')
    }
  }

  /** GET /api/pending-dtc — lee DTCs pendientes (Mode 07). 400 query invalida, 404 escenario inexistente. */
  pendingDtc = async (req: Request, res: Response): Promise<void> => {
    const schema = this.selectSchema(PendingDtcQuerySchema, PendingDtcQueryTcpSchema)
    const parsed = schema.safeParse(req.query)
    if (!parsed.success) {
      res.status(400).json({ error: ERROR_MESSAGES.invalidBody, details: parsed.error.issues })
      return
    }

    try {
      const result = await this.service.readPendingDtcCodes(parsed.data.scenarioId)
      res.status(200).json({ dtcCodes: result })
    } catch (err) {
      if (this.respondIfCommonError(err, res)) return
      this.respondUnexpected(err, res, 'Pending DTC fetch failed')
    }
  }

  /** GET /api/permanent-dtc — lee DTCs permanentes (Mode 0A). 400 query invalida, 404 escenario inexistente. */
  permanentDtc = async (req: Request, res: Response): Promise<void> => {
    const schema = this.selectSchema(PermanentDtcQuerySchema, PermanentDtcQueryTcpSchema)
    const parsed = schema.safeParse(req.query)
    if (!parsed.success) {
      res.status(400).json({ error: ERROR_MESSAGES.invalidBody, details: parsed.error.issues })
      return
    }

    try {
      const result = await this.service.readPermanentDtcCodes(parsed.data.scenarioId)
      res.status(200).json({ dtcCodes: result })
    } catch (err) {
      if (this.respondIfCommonError(err, res)) return
      this.respondUnexpected(err, res, 'Permanent DTC fetch failed')
    }
  }

  /** GET /api/vehicle-status — testigo MIL y monitores de emisiones (Mode 01 PID 01). 400 query invalida, 404 escenario inexistente. */
  vehicleStatus = async (req: Request, res: Response): Promise<void> => {
    const schema = this.selectSchema(VehicleStatusQuerySchema, VehicleStatusQueryTcpSchema)
    const parsed = schema.safeParse(req.query)
    if (!parsed.success) {
      res.status(400).json({ error: ERROR_MESSAGES.invalidBody, details: parsed.error.issues })
      return
    }

    try {
      const result = await this.service.getVehicleStatus(parsed.data.scenarioId)
      res.status(200).json(result)
    } catch (err) {
      if (this.respondIfCommonError(err, res)) return
      this.respondUnexpected(err, res, 'Vehicle status fetch failed')
    }
  }

  private selectSchema<T>(required: z.ZodType<T>, optional: z.ZodType<T>): z.ZodType<T> {
    return this.service.isDirectConnection ? optional : required
  }

  /**
   * Ramas compartidas por los dos manejadores de error.
   *
   * @returns `true` si ha respondido, para que el llamante corte.
   */
  private respondIfCommonError(err: unknown, res: Response): boolean {
    if (err instanceof DiagnosisScenarioNotFoundError) {
      res.status(404).json({ error: ERROR_MESSAGES.scenarioNotFound })
      return true
    }
    if (err instanceof EmptyToolResultError) {
      // 502: la tool respondio, pero sin contenido utilizable. El fallo esta en
      // el servidor MCP, no en la peticion del cliente.
      this.logger.error(`[ERROR] MCP tool returned no content: ${err.toolName}`)
      res.status(502).json({ error: `${ERROR_MESSAGES.emptyToolResult}: ${err.toolName}` })
      return true
    }
    return false
  }

  private handleToolError(err: unknown, res: Response): void {
    if (this.respondIfCommonError(err, res)) return
    if (err instanceof ToolNotFoundError) {
      res.status(404).json({ error: `${ERROR_MESSAGES.toolNotFound}: ${err.toolName}` })
      return
    }
    if (err instanceof ToolCallTimeoutError) {
      res.status(504).json({ error: ERROR_MESSAGES.toolTimedOut })
      return
    }
    this.respondUnexpected(err, res, 'MCP tool call failed')
  }

  private handleCognitiveError(err: unknown, res: Response): void {
    if (this.respondIfCommonError(err, res)) return
    if (err instanceof CognitiveDiagnosisUnavailableError) {
      res.status(404).json({ error: ERROR_MESSAGES.cognitiveUnavailable })
      return
    }
    if (err instanceof CognitiveDiagnosisTimeoutError) {
      res.status(504).json({ error: ERROR_MESSAGES.cognitiveTimedOut })
      return
    }
    this.respondUnexpected(err, res, 'Cognitive diagnosis failed')
  }

  /**
   * Cola comun de los manejadores de error: registra el detalle y responde 500
   * generico, sin filtrar el mensaje interno al cliente.
   */
  private respondUnexpected(err: unknown, res: Response, context: string): void {
    this.logger.error(`[ERROR] ${context}: ${err instanceof Error ? err.message : 'Unknown error'}`)
    res.status(500).json({ error: ERROR_MESSAGES.internalError })
  }
}
