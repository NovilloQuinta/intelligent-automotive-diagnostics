import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import type { LlmClientPort } from '@/application/ports/LlmClientPort.js'
import type { ToolCallHandler } from '@/application/ports/ToolCallHandler.js'
import type { VehicleRepository } from '@/application/ports/VehicleRepository.js'
import type { KnowledgeStack } from '@/application/ports/KnowledgeStack.js'
import type { ObdRepository } from '@/application/ports/ObdRepository.js'
import type { LlmConversationItem } from '@/application/dto/llm/LlmMessageInput.js'
import type { ExecuteCognitiveDiagnosisOutput } from '@/application/dto/diagnosis/ExecuteCognitiveDiagnosisOutput.js'
import { ExecuteCognitiveDiagnosisUseCase } from '@/application/use-cases/ExecuteCognitiveDiagnosisUseCase.js'
import { withTimeout, TimeoutError } from '@/application/shared/withTimeout.js'
import { normalizeManufacturer } from '@/domain/value-objects/manufacturer.js'
import { DiagnosisSession } from '@/domain/entities/diagnosisSession.js'
import { VehicleProfile } from '@/domain/entities/vehicleProfile.js'
import type { VehicleInfo } from '@/domain/value-objects/vehicleInfo.js'
import type { DiagnosticsMcpServer, SessionContext } from '@/infrastructure/mcp/mcpServer.js'
import {
  CognitiveDiagnosisUnavailableError,
  CognitiveDiagnosisTimeoutError,
  DiagnosisSessionNotFoundError,
} from '@/infrastructure/services/errors.js'
import {
  buildDiagnosisSnapshot,
  buildFollowUpSnapshot,
} from '@/infrastructure/services/diagnosisSnapshots.js'
import type {
  CognitiveDiagnosisResult,
  ResolvedDiagnosisSession,
} from '@/infrastructure/services/diagnosisTypes.js'

/**
 * Lo que el flujo cognitivo necesita del servicio que lo hospeda.
 *
 * Son capacidades que pertenecen a `DiagnosisService` y que aqui se reciben
 * explicitamente en vez de heredarse: deja por escrito la superficie exacta que este
 * flujo toca del servicio, que era justo lo que no se veia cuando los siete helpers
 * vivian mezclados con los otros once metodos publicos.
 */
export interface CognitiveDiagnosisHost {
  /** Repositorio OBD del escenario indicado, o del vehiculo conectado. */
  resolveRepository(scenarioId?: string): ObdRepository
  /** Resuelve fabricante y modelo por la cascada de identificacion. */
  identify(vehicleInfo: VehicleInfo): Promise<VehicleInfo>
  /** Traduce la identificacion a la entidad que persiste el repositorio. */
  toVehicleProfile(vehicleInfo: VehicleInfo): VehicleProfile
  /** Cablea el servidor MCP para el escenario y la sesion dados. */
  getMcpServer(scenarioId: string | undefined, session: SessionContext): DiagnosticsMcpServer
  /** Extrae el texto de la respuesta de una tool, o falla si vino vacia. */
  firstText(result: Awaited<ReturnType<DiagnosticsMcpServer['callTool']>>, toolName: string): string
}

/** Colaboradores y ajustes que el flujo cognitivo comparte con el servicio. */
export interface CognitiveDiagnosisDeps {
  readonly host: CognitiveDiagnosisHost
  readonly logger: LoggerPort
  readonly vehicleRepo?: VehicleRepository
  readonly llmClient?: LlmClientPort
  readonly knowledgeStack?: KnowledgeStack
  readonly cognitiveTimeoutMs: number
}

/** Peticion de diagnostico cognitivo, nueva o continuacion de una sesion previa. */
export interface CognitiveDiagnosisInput {
  readonly scenarioId?: string
  readonly userQuery?: string
  readonly conversationHistory?: readonly LlmConversationItem[]
  readonly userId?: number
  readonly sessionId?: number
}

/**
 * Ejecuta el diagnostico cognitivo de principio a fin: resuelve la sesion, interroga
 * al vehiculo a traves del LLM y persiste el informe.
 *
 * Vivia dentro de {@link DiagnosisService} como un metodo publico mas siete privados
 * que no servian a ningun otro metodo. Extraerlo deja el servicio con una unica
 * responsabilidad por metodo y este flujo —el mas largo del sistema— legible de un
 * vistazo.
 */
export class CognitiveDiagnosisRunner {
  private readonly host: CognitiveDiagnosisHost
  private readonly logger: LoggerPort
  private readonly vehicleRepo?: VehicleRepository
  private readonly llmClient?: LlmClientPort
  private readonly knowledgeStack?: KnowledgeStack
  private readonly cognitiveTimeoutMs: number

  constructor(deps: CognitiveDiagnosisDeps) {
    this.host = deps.host
    this.logger = deps.logger
    this.vehicleRepo = deps.vehicleRepo
    this.llmClient = deps.llmClient
    this.knowledgeStack = deps.knowledgeStack
    this.cognitiveTimeoutMs = deps.cognitiveTimeoutMs
  }

  /**
   * Diagnostico cognitivo completo.
   *
   * @throws {CognitiveDiagnosisUnavailableError} Si no hay LLM configurado.
   * @throws {CognitiveDiagnosisTimeoutError} Si el modelo no responde a tiempo.
   * @throws {DiagnosisSessionNotFoundError} Si la sesion a continuar no es del usuario.
   */
  async run(input: CognitiveDiagnosisInput): Promise<CognitiveDiagnosisResult> {
    const { scenarioId, userQuery, conversationHistory, userId, sessionId } = input
    const repository = this.host.resolveRepository(scenarioId)
    const vehicleInfo = await repository.getVehicleInfo()

    const {
      followUpSession,
      sessionId: resolvedSessionId,
      vehicleId,
    } = await this.resolveDiagnosisSession(sessionId, userId, vehicleInfo)

    const llmClient = this.requireLlmClient()

    // D3: la sesión de diagnóstico se crea solo para diagnósticos nuevos (no follow-ups)
    const persistedSessionId = followUpSession
      ? resolvedSessionId
      : await this.createDiagnosisSession(vehicleId, scenarioId, userId)

    const session = this.buildSessionContext(persistedSessionId, vehicleId, vehicleInfo)

    let diagnosisResult: ExecuteCognitiveDiagnosisOutput | undefined
    try {
      diagnosisResult = await this.runCognitiveDiagnosis(llmClient, scenarioId, session, {
        vehicleInfo,
        userQuery,
        conversationHistory,
      })
      return { ...diagnosisResult, sessionId: persistedSessionId }
    } catch (err) {
      if (err instanceof TimeoutError) {
        throw new CognitiveDiagnosisTimeoutError()
      }
      throw err
    } finally {
      this.persistDiagnosisSnapshot(persistedSessionId, followUpSession, {
        vehicleInfo,
        userQuery,
        diagnosisResult,
      })
    }
  }

  /**
   * Resuelve la sesión de follow-up (verificando propiedad) o persiste el vehículo
   * para un diagnóstico nuevo. Fallar aquí evita gastar una llamada LLM.
   */
  private async resolveDiagnosisSession(
    sessionId: number | undefined,
    userId: number | undefined,
    vehicleInfo: VehicleInfo,
  ): Promise<ResolvedDiagnosisSession> {
    if (sessionId === undefined) {
      return {
        followUpSession: undefined,
        sessionId: undefined,
        vehicleId: await this.upsertVehicleForDiagnosis(vehicleInfo),
      }
    }
    if (!this.vehicleRepo || typeof userId !== 'number') {
      throw new DiagnosisSessionNotFoundError()
    }
    const existing = await this.vehicleRepo.findSessionById(sessionId, userId)
    if (!existing) {
      throw new DiagnosisSessionNotFoundError()
    }
    return {
      followUpSession: existing,
      sessionId: existing.id,
      vehicleId: existing.vehicleId ?? undefined,
    }
  }

  /**
   * Persiste el vehículo activo al inicio de un diagnóstico nuevo (D2).
   * Devuelve su id, o `undefined` si no hay repositorio o la escritura falla.
   *
   * Resuelve la identidad **antes** de persistir: marca y modelo son la clave con
   * la que el catálogo RAG archiva y recupera lo aprendido, así que un `unknown`
   * aquí no es cosmético — condena todo lo que el agente aprenda de este coche a
   * quedar bajo `unknown/unknown` y a no recuperarse nunca.
   */
  private async upsertVehicleForDiagnosis(vehicleInfo: VehicleInfo): Promise<number | undefined> {
    if (!this.vehicleRepo) return undefined
    try {
      const identified = await this.host.identify(vehicleInfo)
      const profile = this.host.toVehicleProfile(identified)
      const result = await this.vehicleRepo.upsertVehicle(profile)
      return result.id
    } catch (e) {
      this.logger.warn('Failed to upsert vehicle in diagnosis session', {
        err: e instanceof Error ? e : String(e),
      })
      return undefined
    }
  }

  /** Crea la sesión de diagnóstico (solo diagnósticos nuevos) y devuelve su id, o `undefined` si falla. */
  private async createDiagnosisSession(
    vehicleId: number | undefined,
    scenarioId: string | undefined,
    userId: number | undefined,
  ): Promise<number | undefined> {
    if (vehicleId === undefined || !this.vehicleRepo) return undefined
    try {
      const session = await this.vehicleRepo.createSession(
        new DiagnosisSession({
          id: 0,
          vehicleId,
          userId: userId ?? null,
          scenarioId,
          startedAt: new Date().toISOString(),
        }),
      )
      return session.id
    } catch (e) {
      this.logger.warn('Failed to create diagnosis session', {
        err: e instanceof Error ? e : String(e),
      })
      return undefined
    }
  }

  /** Garantiza que el diagnóstico cognitivo esté disponible (LLM configurado) y devuelve el cliente. */
  private requireLlmClient(): LlmClientPort {
    if (!this.llmClient) {
      this.logger.warn('Cognitive diagnosis requested but no LLM client is configured')
      throw new CognitiveDiagnosisUnavailableError()
    }
    return this.llmClient
  }

  /** Construye el contexto de sesión MCP con fabricante normalizado y modelo. */
  private buildSessionContext(
    sessionId: number | undefined,
    vehicleId: number | undefined,
    vehicleInfo: VehicleInfo,
  ): SessionContext {
    return {
      sessionId,
      vehicleId,
      manufacturer: normalizeManufacturer(vehicleInfo.make),
      model: vehicleInfo.model,
    }
  }

  /**
   * Cablea el servidor MCP, crea el use case cognitivo y lo ejecuta con timeout.
   *
   * @throws {CognitiveDiagnosisTimeoutError} Si se agota `cognitiveTimeoutMs`.
   * @throws {EmptyToolResultError} Si una tool invocada responde sin contenido.
   */
  private runCognitiveDiagnosis(
    llmClient: LlmClientPort,
    scenarioId: string | undefined,
    session: SessionContext,
    input: {
      vehicleInfo: VehicleInfo
      userQuery?: string
      conversationHistory?: readonly LlmConversationItem[]
    },
  ): Promise<ExecuteCognitiveDiagnosisOutput> {
    const mcp = this.host.getMcpServer(scenarioId, session)
    const handler: ToolCallHandler = async (name, args) => {
      const result = await mcp.callTool(name, args)
      return this.host.firstText(result, name)
    }
    const useCase = new ExecuteCognitiveDiagnosisUseCase({
      llmClient,
      tools: mcp.listTools(),
      handler,
      logger: this.logger,
      diagnosisIndex: this.knowledgeStack?.diagnosisIndex,
    })
    return withTimeout(
      useCase.execute({
        userQuery: input.userQuery,
        vehicleContext: input.vehicleInfo,
        conversationHistory: input.conversationHistory,
      }),
      this.cognitiveTimeoutMs,
      'Cognitive diagnosis timed out',
    )
  }

  /**
   * Persiste el snapshot del resultado al cerrar (end) o actualizar (follow-up) la sesión.
   *
   * Fire-and-forget: los fallos de persistencia se registran sin enmascarar el
   * resultado del diagnóstico.
   */
  private persistDiagnosisSnapshot(
    sessionId: number | undefined,
    followUpSession: DiagnosisSession | undefined,
    input: {
      vehicleInfo: VehicleInfo
      userQuery?: string
      diagnosisResult?: ExecuteCognitiveDiagnosisOutput
    },
  ): void {
    if (sessionId === undefined || !this.vehicleRepo) return
    if (followUpSession) {
      if (!input.diagnosisResult) return
      const snapshot = buildFollowUpSnapshot(
        input.vehicleInfo,
        followUpSession.resultJson,
        input.userQuery,
        input.diagnosisResult,
        this.logger,
      )
      void this.vehicleRepo
        .updateSessionResult(sessionId, snapshot)
        .catch((e) => this.logger.warn('Failed to update diagnosis session with snapshot', e))
      return
    }
    const snapshot = buildDiagnosisSnapshot(input.vehicleInfo, input.diagnosisResult)
    void this.vehicleRepo
      .endSession(sessionId, snapshot ?? undefined)
      .catch((e) => this.logger.warn('Failed to end diagnosis session with snapshot', e))
  }
}
