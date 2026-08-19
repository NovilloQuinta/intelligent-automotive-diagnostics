import type { Request, Response } from 'express'
import { z } from 'zod'
import { VehicleIdentityError } from '@/domain/entities/vehicleIdentity.js'
import { VinDecodeError } from '@/domain/value-objects/vin.js'
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
  DiagnosisSessionNotFoundError,
  VehicleIdentificationUnavailableError,
} from '@/infrastructure/services/errors.js'
import { MaxToolCallIterationsError } from '@/application/llm/llmErrors.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import type { LlmConversationItem } from '@/application/dto/llm/LlmMessageInput.js'
import {
  DiagnosisBodySchema,
  DiagnosisBodyTcpSchema,
  McpToolBodySchema,
  McpToolBodyTcpSchema,
  McpToolParamsSchema,
  CognitiveDiagnosisBodySchema,
  CognitiveDiagnosisBodyTcpSchema,
  FreezeFrameQuerySchema,
  FreezeFrameQueryTcpSchema,
  EcuInfoQuerySchema,
  EcuInfoQueryTcpSchema,
  VehicleInfoQuerySchema,
  VehicleInfoQueryTcpSchema,
  VehicleIdentityBodySchema,
  LiveDataQuerySchema,
  LiveDataQueryTcpSchema,
  ClearDtcBodySchema,
  ClearDtcBodyTcpSchema,
  PendingDtcQuerySchema,
  PendingDtcQueryTcpSchema,
  PermanentDtcQuerySchema,
  PermanentDtcQueryTcpSchema,
  VehicleStatusQuerySchema,
  VehicleStatusQueryTcpSchema,
  DiagnosisHistoryQuerySchema,
  DiagnosisSessionIdSchema,
} from '@/application/dto/diagnosis/DiagnosisRequestSchemas.js'

const ERROR_MESSAGES = {
  scenarioNotFound: 'Scenario not found',
  invalidBody: 'Invalid request body',
  invalidToolName: 'Invalid tool name',
  toolNotFound: 'Tool not found',
  toolTimedOut: 'Tool call timed out',
  emptyToolResult: 'Tool returned no content',
  cognitiveTimedOut: 'Cognitive diagnosis timed out',
  cognitiveUnavailable: 'Cognitive diagnosis is not available',
  identificationUnavailable: 'Vehicle identification is not available',
  invalidVehicleIdentity: 'Invalid vehicle identity',
  cognitiveTooManySteps:
    'El diagnóstico necesitó demasiados pasos. Prueba con una pregunta más concreta.',
  internalError: 'Internal server error',
  invalidDateRange: 'from must be before to',
  sessionNotFound: 'Diagnosis session not found',
  accessTokenRequired: 'Access token required',
} as const

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

  /** GET /api/available-pids — catalogo de PIDs Mode 01 seleccionables en telemetria en vivo. */
  availablePids = (_req: Request, res: Response): void => {
    res.status(200).json({ pids: this.service.listAvailablePids() })
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
        sessionId: parsed.data.sessionId,
      })
      res.status(200).json(result)
    } catch (err) {
      this.handleCognitiveError(err, res)
    }
  }

  /** GET /api/freeze-frame — freeze frame del DTC seleccionado. 400 query invalida, 404 escenario inexistente. */
  freezeFrame = (req: Request, res: Response): Promise<void> =>
    this.runDiagnosisHandler(
      req,
      res,
      this.selectSchema(FreezeFrameQuerySchema, FreezeFrameQueryTcpSchema),
      'query',
      'Freeze frame fetch failed',
      (data) => this.service.getFreezeFrame(data.scenarioId, data.dtc),
      (result) => res.status(200).json({ freezeFrame: result }),
    )

  /** GET /api/ecu-info — ECUs descubiertas en el vehiculo. 400 query invalida, 404 escenario inexistente. */
  ecuInfo = (req: Request, res: Response): Promise<void> =>
    this.runDiagnosisHandler(
      req,
      res,
      this.selectSchema(EcuInfoQuerySchema, EcuInfoQueryTcpSchema),
      'query',
      'ECU info fetch failed',
      (data) => this.service.getEcuInfo(data.scenarioId),
      (result) => res.status(200).json({ ecus: result }),
    )

  /** GET /api/vehicle-info — VIN y datos del vehiculo. 400 query invalida, 404 escenario inexistente. */
  vehicleInfo = (req: Request, res: Response): Promise<void> =>
    this.runDiagnosisHandler(
      req,
      res,
      this.selectSchema(VehicleInfoQuerySchema, VehicleInfoQueryTcpSchema),
      'query',
      'Vehicle info fetch failed',
      (data) => this.service.getVehicleInfo(data.scenarioId),
      (result) => res.status(200).json(result),
    )

  /**
   * POST /api/vehicle-identity — el mecanico corrige la identificacion del coche.
   *
   * Ultima rama de la cascada, para cuando ni el catalogo ni la web sacan el
   * vehiculo. 400 payload invalido o marca sin forma de nombre, 404 sin
   * persistencia configurada.
   */
  confirmVehicleIdentity = async (req: Request, res: Response): Promise<void> => {
    const parsed = VehicleIdentityBodySchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: ERROR_MESSAGES.invalidBody, details: parsed.error.issues })
      return
    }

    try {
      res.status(200).json(await this.service.confirmVehicleIdentity(parsed.data))
    } catch (err) {
      if (err instanceof VehicleIdentificationUnavailableError) {
        res.status(404).json({ error: ERROR_MESSAGES.identificationUnavailable })
        return
      }
      // El dominio rechaza VINs y marcas mal formadas: es culpa del cliente, no del servidor.
      if (err instanceof VehicleIdentityError || err instanceof VinDecodeError) {
        res.status(400).json({ error: ERROR_MESSAGES.invalidVehicleIdentity, details: err.message })
        return
      }
      this.respondUnexpected(err, res, 'Vehicle identity confirmation failed')
    }
  }

  /** GET /api/live-data — telemetria en vivo de los 4 PIDs del dashboard. 400 query invalida, 404 escenario inexistente. */
  liveData = (req: Request, res: Response): Promise<void> =>
    this.runDiagnosisHandler(
      req,
      res,
      this.selectSchema(LiveDataQuerySchema, LiveDataQueryTcpSchema),
      'query',
      'Live data fetch failed',
      (data) => this.service.getLiveData(data.scenarioId, data.pids),
      (result) => res.status(200).json(result),
    )

  /** POST /api/clear-dtc — borra DTCs almacenados (Mode 04). 400 body invalido, 404 escenario inexistente. */
  clearDtc = (req: Request, res: Response): Promise<void> =>
    this.runDiagnosisHandler(
      req,
      res,
      this.selectSchema(ClearDtcBodySchema, ClearDtcBodyTcpSchema),
      'body',
      'Clear DTC failed',
      (data) => this.service.clearDtcCodes(data.scenarioId),
      () => res.status(200).json({ cleared: true }),
    )

  /** GET /api/pending-dtc — lee DTCs pendientes (Mode 07). 400 query invalida, 404 escenario inexistente. */
  pendingDtc = (req: Request, res: Response): Promise<void> =>
    this.runDiagnosisHandler(
      req,
      res,
      this.selectSchema(PendingDtcQuerySchema, PendingDtcQueryTcpSchema),
      'query',
      'Pending DTC fetch failed',
      (data) => this.service.readPendingDtcCodes(data.scenarioId),
      (result) => res.status(200).json({ dtcCodes: result }),
    )

  /** GET /api/permanent-dtc — lee DTCs permanentes (Mode 0A). 400 query invalida, 404 escenario inexistente. */
  permanentDtc = (req: Request, res: Response): Promise<void> =>
    this.runDiagnosisHandler(
      req,
      res,
      this.selectSchema(PermanentDtcQuerySchema, PermanentDtcQueryTcpSchema),
      'query',
      'Permanent DTC fetch failed',
      (data) => this.service.readPermanentDtcCodes(data.scenarioId),
      (result) => res.status(200).json({ dtcCodes: result }),
    )

  /** GET /api/vehicle-status — testigo MIL y monitores de emisiones (Mode 01 PID 01). 400 query invalida, 404 escenario inexistente. */
  vehicleStatus = (req: Request, res: Response): Promise<void> =>
    this.runDiagnosisHandler(
      req,
      res,
      this.selectSchema(VehicleStatusQuerySchema, VehicleStatusQueryTcpSchema),
      'query',
      'Vehicle status fetch failed',
      (data) => this.service.getVehicleStatus(data.scenarioId),
      (result) => res.status(200).json(result),
    )

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
      res.status(401).json({ error: ERROR_MESSAGES.accessTokenRequired })
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
      res.status(401).json({ error: ERROR_MESSAGES.accessTokenRequired })
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
   * Mecánica compartida por los handlers de lectura/escritura del vehículo:
   * valida `query`/`body` con el esquema, ejecuta la llamada al servicio y
   * responde 200; en caso de error, delega en los manejadores comunes.
   *
   * Elimina la duplicación del patrón `safeParse`→400→`try/call`→`respond`→
   * `catch`→`respondIfCommonError`/`respondUnexpected` presente en los 8
   * handlers de diagnosis.
   */
  private async runDiagnosisHandler<TData, TResult>(
    req: Request,
    res: Response,
    schema: z.ZodType<TData, z.ZodTypeDef, unknown>,
    source: 'query' | 'body',
    context: string,
    call: (data: TData) => Promise<TResult>,
    respond: (result: TResult) => void,
  ): Promise<void> {
    const parsed = schema.safeParse(req[source])
    if (!parsed.success) {
      res.status(400).json({ error: ERROR_MESSAGES.invalidBody, details: parsed.error.issues })
      return
    }

    try {
      respond(await call(parsed.data))
    } catch (err) {
      if (this.respondIfCommonError(err, res)) return
      this.respondUnexpected(err, res, context)
    }
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
    if (err instanceof DiagnosisSessionNotFoundError) {
      res.status(404).json({ error: ERROR_MESSAGES.sessionNotFound })
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
