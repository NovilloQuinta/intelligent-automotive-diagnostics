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
import { MaxToolCallIterationsError } from '@/application/llm/llmErrors.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import type { LlmConversationItem } from '@/application/dto/llm/LlmMessageInput.js'
import { ALL_SEED_PIDS } from '@/infrastructure/persistence/sqlite/seed-pids.js'
import { MODE_CURRENT_DATA } from '@/domain/pids.js'

const ERROR_MESSAGES = {
  scenarioNotFound: 'Scenario not found',
  invalidBody: 'Invalid request body',
  invalidToolName: 'Invalid tool name',
  toolNotFound: 'Tool not found',
  toolTimedOut: 'Tool call timed out',
  emptyToolResult: 'Tool returned no content',
  cognitiveTimedOut: 'Cognitive diagnosis timed out',
  cognitiveUnavailable: 'Cognitive diagnosis is not available',
  cognitiveTooManySteps:
    'El diagnóstico necesitó demasiados pasos. Prueba con una pregunta más concreta.',
  internalError: 'Internal server error',
  invalidDateRange: 'from must be before to',
  sessionNotFound: 'Diagnosis session not found',
} as const

/** scenarioId obligatorio: modo simulacion, donde hay que elegir escenario. */
const requiredScenarioId = z.string().min(1, 'scenarioId is required')

/** scenarioId opcional: modo TCP directo, donde solo hay un vehiculo conectado. */
const optionalScenarioId = z.string().min(1).optional()

/**
 * Crea el par docker/tcp de esquemas Zod para un endpoint, aplicando
 * `scenarioId` requerido u opcional segun el modo de conexion.
 */
function scenarioSchemas<T extends Record<string, z.ZodTypeAny>>(
  extra: T,
): {
  docker: z.ZodObject<{ scenarioId: z.ZodString } & T>
  tcp: z.ZodObject<{ scenarioId: z.ZodOptional<z.ZodString> } & T>
} {
  return {
    docker: z.object({ scenarioId: requiredScenarioId, ...extra }),
    tcp: z.object({ scenarioId: optionalScenarioId, ...extra }),
  }
}

const { docker: DiagnosisBodySchema, tcp: DiagnosisBodyTcpSchema } = scenarioSchemas({})

const { docker: McpToolBodySchema, tcp: McpToolBodyTcpSchema } = scenarioSchemas({
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

const { docker: CognitiveDiagnosisBodySchema, tcp: CognitiveDiagnosisBodyTcpSchema } =
  scenarioSchemas({
    query: z.string().optional(),
    history: z.array(LlmConversationItemSchema).optional(),
  })

const { docker: FreezeFrameQuerySchema, tcp: FreezeFrameQueryTcpSchema } = scenarioSchemas({
  dtc: z.string().optional(),
})

const { docker: EcuInfoQuerySchema, tcp: EcuInfoQueryTcpSchema } = scenarioSchemas({})

const { docker: VehicleInfoQuerySchema, tcp: VehicleInfoQueryTcpSchema } = scenarioSchemas({})

/** Códigos de PID Mode 01 válidos (SAE J1979) según el catálogo de seed data. */
const MODE_01_PID_CODES = new Set(
  ALL_SEED_PIDS.filter((p) => p.pidCode.mode === MODE_CURRENT_DATA).map((p) => p.pidCode.pid),
)

/** Número máximo de PIDs simultáneos en un comando multi-PID (design D6). */
const MAX_LIVE_PIDS = 8

/** Query param `pids` opcional: lista separada por comas de códigos de PID Mode 01. */
const PidsQuerySchema = z
  .string()
  .optional()
  .transform((raw) =>
    raw === undefined || raw.trim() === ''
      ? undefined
      : raw.split(',').map((p) => p.trim().toUpperCase()),
  )
  .refine((pids) => pids === undefined || pids.length <= MAX_LIVE_PIDS, {
    message: `Maximum ${MAX_LIVE_PIDS} PIDs allowed`,
  })
  .refine((pids) => pids === undefined || pids.every((pid) => MODE_01_PID_CODES.has(pid)), {
    message: 'Invalid PID code',
  })

const { docker: LiveDataQuerySchema, tcp: LiveDataQueryTcpSchema } = scenarioSchemas({
  pids: PidsQuerySchema,
})

const { docker: ClearDtcBodySchema, tcp: ClearDtcBodyTcpSchema } = scenarioSchemas({})

const { docker: PendingDtcQuerySchema, tcp: PendingDtcQueryTcpSchema } = scenarioSchemas({})

const { docker: PermanentDtcQuerySchema, tcp: PermanentDtcQueryTcpSchema } = scenarioSchemas({})

const { docker: VehicleStatusQuerySchema, tcp: VehicleStatusQueryTcpSchema } = scenarioSchemas({})

/** Filtros de listado del historial — todos opcionales,
 *  `userId` nunca viaja en query (se toma del token). */
const DiagnosisHistoryQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  scenarioId: z.string().optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
})

/** Parametro de ruta para GET /api/diagnosis-history/:id */
const DiagnosisSessionIdSchema = z.object({
  id: z.coerce.number().int().min(1),
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
        userId: req.userId,
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
      const result = await this.service.getLiveData(parsed.data.scenarioId, parsed.data.pids)
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

  /** GET /api/diagnosis-history — listado paginado de sesiones del usuario autenticado. */
  listHistory = async (req: Request, res: Response): Promise<void> => {
    const parsed = DiagnosisHistoryQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      res.status(400).json({ error: ERROR_MESSAGES.invalidBody, details: parsed.error.issues })
      return
    }

    const { from, to, scenarioId, severity, limit, offset } = parsed.data

    if (from && to && from > to) {
      res.status(400).json({ error: ERROR_MESSAGES.invalidDateRange })
      return
    }

    const userId = req.userId
    if (!userId) {
      res.status(401).json({ error: 'Access token required' })
      return
    }

    try {
      const page = await this.service.listDiagnosisSessions({
        userId,
        from,
        to,
        scenarioId,
        severity,
        limit,
        offset,
      })

      // No incluir resultJson en el listado
      const items = page.items.map((s) => ({
        id: s.id,
        vehicleId: s.vehicleId,
        scenarioId: s.scenarioId,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        severity: s.severity,
        dtcCount: s.dtcCount,
      }))

      res.status(200).json({ items, total: page.total })
    } catch (err) {
      this.respondUnexpected(err, res, 'Diagnosis history fetch failed')
    }
  }

  /** GET /api/diagnosis-history/:id — detalle de una sesion concreta. */
  getHistoryDetail = async (req: Request<{ id: string }>, res: Response): Promise<void> => {
    const parsed = DiagnosisSessionIdSchema.safeParse(req.params)
    if (!parsed.success) {
      res.status(400).json({ error: ERROR_MESSAGES.invalidBody, details: parsed.error.issues })
      return
    }

    const userId = req.userId
    if (!userId) {
      res.status(401).json({ error: 'Access token required' })
      return
    }

    try {
      const session = await this.service.getDiagnosisSession(parsed.data.id, userId)
      if (!session) {
        res.status(404).json({ error: ERROR_MESSAGES.sessionNotFound })
        return
      }

      res.status(200).json({
        id: session.id,
        vehicleId: session.vehicleId,
        scenarioId: session.scenarioId,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        severity: session.severity,
        dtcCount: session.dtcCount,
        resultJson: session.resultJson ?? null,
      })
    } catch (err) {
      this.respondUnexpected(err, res, 'Diagnosis session detail fetch failed')
    }
  }

  private selectSchema<T>(
    required: z.ZodType<T, z.ZodTypeDef, unknown>,
    optional: z.ZodType<T, z.ZodTypeDef, unknown>,
  ): z.ZodType<T, z.ZodTypeDef, unknown> {
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
    if (err instanceof MaxToolCallIterationsError) {
      // 422: la peticion era valida, pero el LLM no pudo terminar en el limite de
      // iteraciones. Un 4xx preserva el mensaje hasta la UI (ver design.md Decision 2).
      res.status(422).json({ error: ERROR_MESSAGES.cognitiveTooManySteps })
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
