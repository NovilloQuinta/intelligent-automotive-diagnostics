import { ProcessVehicleDiagnosisUseCase } from '@/application/use-cases/ProcessVehicleDiagnosisUseCase.js'
import {
  withTimeout,
  TimeoutError,
  DIAGNOSIS_TIMEOUT_MS,
} from '@/application/shared/withTimeout.js'
import {
  createMcpServer,
  type ToolCallResult,
  type SessionContext,
} from '@/infrastructure/mcp/mcpServer.js'
import {
  ToolNotFoundError,
  ToolCallTimeoutError,
  EmptyToolResultError,
} from '@/infrastructure/mcp/errors.js'
import {
  DiagnosisScenarioNotFoundError,
  VehicleIdentificationUnavailableError,
} from '@/infrastructure/services/errors.js'
import type { ObdRepository } from '@/application/ports/ObdRepository.js'
import type { EcuInfo } from '@/domain/entities/EcuInfo.js'
import type { LlmClientPort } from '@/application/ports/LlmClientPort.js'
import { CognitiveDiagnosisRunner } from '@/infrastructure/services/cognitive/cognitiveDiagnosisRunner.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import type { DiagnosisResult } from '@/domain/value-objects/DiagnosisResult.js'
import type { FreezeFrame } from '@/domain/value-objects/FreezeFrame.js'
import type { DtcCode } from '@/domain/value-objects/DtcCode.js'
import { ResolveVehicleIdentityUseCase } from '@/application/use-cases/ResolveVehicleIdentityUseCase.js'
import {
  ConfirmVehicleIdentityUseCase,
  type ConfirmVehicleIdentityOutput,
} from '@/application/use-cases/ConfirmVehicleIdentityUseCase.js'
import type { VehicleStatus } from '@/domain/value-objects/VehicleStatus.js'
import { Vin } from '@/domain/value-objects/Vin.js'
import type { LlmConversationItem } from '@/application/dto/llm/LlmMessageInput.js'
import type { KnowledgeStackPort } from '@/application/ports/KnowledgeStackPort.js'
import type { WebSearchPort } from '@/application/ports/WebSearchPort.js'
import type { VehicleRepository } from '@/application/ports/VehicleRepository.js'
import { GetEcuInfoUseCase } from '@/application/use-cases/GetEcuInfoUseCase.js'
import {
  GetLiveDataUseCase,
  type GetLiveDataOutput,
} from '@/application/use-cases/GetLiveDataUseCase.js'
import { GetVehicleInfoUseCase } from '@/application/use-cases/GetVehicleInfoUseCase.js'
import { IdentifyVehicleUseCase } from '@/application/use-cases/IdentifyVehicleUseCase.js'
import type {
  DiagnosisSessionFilter,
  DiagnosisSessionPage,
} from '@/application/ports/VehicleRepository.js'
import { DiagnosisSession } from '@/domain/entities/DiagnosisSession.js'
import { MODE_CURRENT_DATA } from '@/domain/pids.js'
import {
  PID_OBSERVATION_CATALOG,
  type PidObservationDefinition,
} from '@/domain/catalogs/pidObservationCatalog.js'

import {
  COGNITIVE_DIAGNOSIS_TIMEOUT_MS,
  PID_METADATA,
  TCP_DIRECT_SCENARIO,
  type DiagnosisServiceOptions,
  type ScenarioDescriptor,
  type AvailablePid,
  type PidOperatingWindow,
  type CognitiveDiagnosisResult,
  type DiagnoseOutput,
  type VehicleInfoOutput,
} from '@/infrastructure/services/diagnosisTypes.js'

/**
 * Extrae la ventana operativa de una definicion de observacion, o `undefined` si el
 * PID no declara ningun extremo.
 *
 * Devolver `{}` seria peor que no devolver nada: una ventana vacia parece un criterio
 * que siempre aprueba, cuando lo que ocurre es que no hay criterio que aplicar.
 */
function toOperatingWindow(
  definition: PidObservationDefinition | undefined,
): PidOperatingWindow | undefined {
  if (definition === undefined) return undefined
  const { minValue, maxValue } = definition
  if (minValue === undefined && maxValue === undefined) return undefined
  return {
    ...(minValue !== undefined && { min: minValue }),
    ...(maxValue !== undefined && { max: maxValue }),
  }
}

/**
 * Tipos y descriptores de escenario re-exportados desde `diagnosisTypes`.
 *
 * El contrato publico del servicio sigue siendo este fichero: los 9 consumidores
 * importan de aqui y no han tenido que cambiar.
 */
export type {
  ScenarioDescriptor,
  DiagnoseOutput,
  VehicleInfoOutput,
  TelemetryOutput,
  PidReading,
  AvailablePid,
  CognitiveDiagnosisResult,
  DiagnosisServiceOptions,
} from '@/infrastructure/services/diagnosisTypes.js'

/** Escenario sintetico para ELM327 USB/serial, re-exportado desde `diagnosisTypes`. */
export { SERIAL_DIRECT_SCENARIO } from '@/infrastructure/services/diagnosisTypes.js'

/** Servicio de orquestacion de diagnostico: resuelve repositorios, crea casos de uso y delega en MCP. */
export class DiagnosisService {
  private readonly scenarios: ScenarioDescriptor[]
  private readonly obdRepos: Map<string, ObdRepository>
  private readonly obdRepo: ObdRepository | undefined
  private readonly directScenario: ScenarioDescriptor
  private readonly llmClient: LlmClientPort | undefined
  private readonly knowledgeStack: KnowledgeStackPort | undefined
  private readonly webSearch: WebSearchPort | undefined
  private readonly vehicleRepo: VehicleRepository | undefined
  private readonly logger: LoggerPort
  private readonly cognitiveTimeoutMs: number
  private readonly toolCallTimeoutMs: number
  private readonly identityResolver: ResolveVehicleIdentityUseCase
  private readonly cognitiveRunner: CognitiveDiagnosisRunner
  private readonly getEcuInfoUseCase: GetEcuInfoUseCase
  private readonly getLiveDataUseCase: GetLiveDataUseCase
  private readonly getVehicleInfoUseCase: GetVehicleInfoUseCase
  private readonly identifyVehicle: IdentifyVehicleUseCase

  constructor(options: DiagnosisServiceOptions) {
    this.scenarios = options.scenarios
    this.obdRepos = options.obdRepos ?? new Map()
    this.obdRepo = options.obdRepo
    this.directScenario = options.directScenario ?? TCP_DIRECT_SCENARIO
    this.llmClient = options.llmClient
    this.knowledgeStack = options.knowledgeStack
    this.webSearch = options.webSearch
    this.vehicleRepo = options.vehicleRepo
    this.logger = options.logger
    this.cognitiveTimeoutMs = options.cognitiveTimeoutMs ?? COGNITIVE_DIAGNOSIS_TIMEOUT_MS
    this.toolCallTimeoutMs = options.toolCallTimeoutMs ?? DIAGNOSIS_TIMEOUT_MS
    this.identityResolver = new ResolveVehicleIdentityUseCase({
      vehicleRepo: this.vehicleRepo,
      webSearch: this.webSearch,
      llmClient: this.llmClient,
      logger: this.logger,
    })
    this.identifyVehicle = new IdentifyVehicleUseCase({ identityResolver: this.identityResolver })
    this.getEcuInfoUseCase = new GetEcuInfoUseCase({
      vehicleRepo: this.vehicleRepo,
      logger: this.logger,
      identifyVehicle: this.identifyVehicle,
    })
    this.getLiveDataUseCase = new GetLiveDataUseCase()
    this.getVehicleInfoUseCase = new GetVehicleInfoUseCase({
      identityResolver: this.identityResolver,
    })
    this.cognitiveRunner = this.buildCognitiveRunner()
  }

  /**
   * Arma el flujo cognitivo con las cinco capacidades que necesita de este servicio.
   *
   * Sale del constructor porque es lo unico que se cablea con metodos ligados en vez de
   * con dependencias planas, y declararlo aparte lo deja a la vista.
   */
  private buildCognitiveRunner(): CognitiveDiagnosisRunner {
    return new CognitiveDiagnosisRunner({
      host: {
        resolveRepository: (scenarioId) => this.resolveRepository(scenarioId),
        identify: (vehicleInfo) => this.identifyVehicle.execute(vehicleInfo),
        toVehicleProfile: (vehicleInfo) => this.identifyVehicle.toVehicleProfile(vehicleInfo),
        getMcpServer: (scenarioId, session) => this.getMcpServer(scenarioId, session),
        firstText: (result, toolName) => this.firstText(result, toolName),
      },
      logger: this.logger,
      vehicleRepo: this.vehicleRepo,
      llmClient: this.llmClient,
      knowledgeStack: this.knowledgeStack,
      cognitiveTimeoutMs: this.cognitiveTimeoutMs,
    })
  }

  /** True cuando se opera contra un unico ELM327 TCP real (scenarioId opcional). */
  get isDirectConnection(): boolean {
    return this.obdRepo !== undefined
  }

  /** True cuando el diagnostico cognitivo esta disponible (LLM configurado). */
  get hasCognitiveDiagnosis(): boolean {
    return this.llmClient !== undefined
  }

  /** Escenarios seleccionables: los del emulador docker, o el sintetico en modo directo. */
  listScenarios(): ScenarioDescriptor[] {
    if (this.obdRepo) return [this.directScenario]
    return this.scenarios
  }

  /**
   * Ejecuta el diagnostico determinista sobre un escenario.
   *
   * @throws {DiagnosisScenarioNotFoundError} Si `scenarioId` no existe.
   */
  async diagnose(scenarioId?: string): Promise<DiagnoseOutput> {
    const repository = this.resolveRepository(scenarioId)
    const useCase = new ProcessVehicleDiagnosisUseCase(repository)
    const result = await useCase.execute()
    return {
      rawData: JSON.stringify(result.parsedValues),
      parsedValues: result.parsedValues,
      dtcCodes: result.dtcCodes,
      diagnosisText: this.buildDiagnosisText(result),
      severity: result.severity,
    }
  }

  /**
   * Devuelve el freeze frame del DTC seleccionado.
   *
   * @param scenarioId — Escenario; opcional en modo TCP directo.
   * @param dtc — Codigo DTC opcional; si se omite, devuelve el del escenario.
   * @throws {DiagnosisScenarioNotFoundError} Si `scenarioId` no existe.
   */
  async getFreezeFrame(scenarioId?: string, dtc?: string): Promise<FreezeFrame | null> {
    const repository = this.resolveRepository(scenarioId)
    return repository.getFreezeFrame(dtc)
  }

  /**
   * Lee los PIDs del dashboard en tiempo real con degradacion por PID.
   *
   * Acepta un array opcional de PIDs; sin el usa {@link DEFAULT_LIVE_PIDS}
   * (compatibilidad hacia atras). Devuelve:
   * - Los 4 campos nombrados (`rpm`, `coolantTemp`, `speed`, `intakeTemp`) cuando el PID
   *   solicitado tiene gauge dedicado; un PID que falla (NO DATA) llega a `null`.
   * - Un array generico `readings` con una entrada `{ code, name, unit, value }` por PID
   *   solicitado, enriqueciendo `name`/`unit` desde {@link ALL_SEED_PIDS}. Un PID fallido
   *   aparece con `value: null` (no se omite la entrada).
   *
   * La cadencia la controla el cliente (1 Hz via `refetchInterval`).
   *
   * @param scenarioId — Escenario; opcional en modo TCP directo.
   * @param pids — Codigos de PID Mode 01 opcionales (ej. `['0C', '0D']`).
   * @throws {DiagnosisScenarioNotFoundError} Si `scenarioId` no existe.
   */
  async getLiveData(scenarioId?: string, pids?: readonly string[]): Promise<GetLiveDataOutput> {
    return this.getLiveDataUseCase.execute(this.resolveRepository(scenarioId), pids)
  }

  /**
   * Lista los PIDs Mode 01 del catalogo SAE J1979 disponibles para el selector
   * de telemetria en vivo.
   *
   * Es un catalogo global (no depende del vehiculo conectado): si un coche no
   * soporta un PID, la lectura degrada a `null` en {@link getLiveData} y el
   * gauge muestra `—`.
   *
   * Cada PID viaja con su ventana operativa cuando el catalogo de observacion la
   * define, para que el veredicto OK/Revisar del dashboard salga del dominio y no
   * de umbrales reescritos en el navegador. Los PIDs sin ventana se pintan sin
   * veredicto: no tener criterio no es lo mismo que estar bien.
   *
   * @returns Los 16 PIDs Mode 01 con su nombre, unidad y ventana, en orden de catalogo.
   */
  listAvailablePids(): AvailablePid[] {
    return Array.from(PID_METADATA.entries()).map(([pid, meta]) => {
      const code = `${MODE_CURRENT_DATA} ${pid}`
      const operatingWindow = toOperatingWindow(PID_OBSERVATION_CATALOG.get(code))
      return {
        code,
        name: meta.name,
        unit: meta.unit,
        ...(operatingWindow !== undefined && { operatingWindow }),
      }
    })
  }

  /**
   * Devuelve las ECUs descubiertas en el vehiculo activo.
   *
   * @param scenarioId — Escenario; opcional en modo TCP directo.
   * @throws {DiagnosisScenarioNotFoundError} Si `scenarioId` no existe.
   */
  async getEcuInfo(scenarioId?: string): Promise<EcuInfo[]> {
    return this.getEcuInfoUseCase.execute(this.resolveRepository(scenarioId))
  }

  /**
   * Devuelve el estado del testigo MIL y monitores de emisiones del vehiculo activo.
   *
   * @param scenarioId — Escenario; opcional en modo TCP directo.
   * @throws {DiagnosisScenarioNotFoundError} Si `scenarioId` no existe.
   */
  async getVehicleStatus(scenarioId?: string): Promise<VehicleStatus> {
    const repository = this.resolveRepository(scenarioId)
    return repository.getVehicleStatus()
  }

  /**
   * Borra los DTCs y valores almacenados del vehiculo activo (Mode 04).
   *
   * @param scenarioId — Escenario; opcional en modo TCP directo.
   * @throws {DiagnosisScenarioNotFoundError} Si `scenarioId` no existe.
   */
  async clearDtcCodes(scenarioId?: string): Promise<void> {
    const repository = this.resolveRepository(scenarioId)
    await repository.clearDtcCodes()
  }

  /**
   * Lee los codigos de fallo pendientes (Mode 07 — no confirmados).
   *
   * @param scenarioId — Escenario; opcional en modo TCP directo.
   * @throws {DiagnosisScenarioNotFoundError} Si `scenarioId` no existe.
   */
  async readPendingDtcCodes(scenarioId?: string): Promise<DtcCode[]> {
    const repository = this.resolveRepository(scenarioId)
    return repository.readPendingDtcCodes()
  }

  /**
   * Lee los codigos de fallo permanentes (Mode 0A — no borrables con Mode 04).
   *
   * @param scenarioId — Escenario; opcional en modo TCP directo.
   * @throws {DiagnosisScenarioNotFoundError} Si `scenarioId` no existe.
   */
  async readPermanentDtcCodes(scenarioId?: string): Promise<DtcCode[]> {
    const repository = this.resolveRepository(scenarioId)
    return repository.readPermanentDtcCodes()
  }

  /**
   * Lista paginada del historial de diagnosticos del usuario autenticado.
   *
   * Los filtros se resuelven en SQL; nunca se carga el historial completo en memoria.
   * `userId` no se acepta por query — se toma del token en el controlador (OWASP A01).
   * La respuesta del listado no incluye `resultJson` para no saturar la red.
   *
   * @throws {Error} Si `vehicleRepo` no esta configurado (nunca en produccion con BD).
   */
  async listDiagnosisSessions(filter: DiagnosisSessionFilter): Promise<DiagnosisSessionPage> {
    if (!this.vehicleRepo) {
      throw new Error('Vehicle repository not configured')
    }
    return this.vehicleRepo.findSessions(filter)
  }

  /**
   * Detalle de una sesion de diagnostico, solo si pertenece al usuario indicado.
   *
   * @returns La sesion con `resultJson` incluido, o `null` si no existe o es de otro usuario.
   */
  async getDiagnosisSession(id: number, userId: number): Promise<DiagnosisSession | null> {
    if (!this.vehicleRepo) {
      throw new Error('Vehicle repository not configured')
    }
    return this.vehicleRepo.findSessionById(id, userId)
  }

  /**
   * Identifica el vehiculo activo: VIN del ECU + metadatos del descriptor.
   *
   * En modo Docker, fusiona el VIN leido del emulador con `make`/`model`/`year`/`engineType`
   * del {@link ScenarioDescriptor}. El VIN siempre es el del vehículo real, nunca el del catálogo.
   * En modo TCP directo (sin descriptor) se mantiene el comportamiento actual: los metadatos
   * se deducen exclusivamente del VIN.
   *
   * @param scenarioId — Escenario; opcional en modo TCP directo.
   * @throws {DiagnosisScenarioNotFoundError} Si `scenarioId` no existe.
   */
  async getVehicleInfo(scenarioId?: string): Promise<VehicleInfoOutput> {
    // El descriptor se resuelve aqui: saber que escenarios existen es infraestructura.
    const descriptor = scenarioId ? this.scenarios.find((s) => s.id === scenarioId) : undefined
    return this.getVehicleInfoUseCase.execute(
      this.resolveRepository(scenarioId),
      descriptor?.vehicleInfo,
    )
  }

  /**
   * Registra la identificacion que aporta el mecanico cuando la cascada no saca
   * el coche.
   *
   * @throws {VehicleIdentificationUnavailableError} Si no hay repositorio configurado.
   * @throws {VinDecodeError} Si el VIN no cumple el formato ISO 3779.
   * @throws {VehicleIdentityError} Si la marca no tiene forma de nombre de fabricante.
   */
  async confirmVehicleIdentity(input: {
    vin: string
    make: string
    model?: string
    year?: number
    engineType?: string
  }): Promise<ConfirmVehicleIdentityOutput> {
    if (!this.vehicleRepo) throw new VehicleIdentificationUnavailableError()
    const useCase = new ConfirmVehicleIdentityUseCase({
      vehicleRepo: this.vehicleRepo,
      logger: this.logger,
    })
    return useCase.execute({ ...input, vin: new Vin(input.vin) })
  }

  /**
   * Ejecuta el diagnostico cognitivo con tool calling sobre el servidor MCP.
   *
   * Persiste el vehiculo al inicio de la sesion (si `vehicleRepo` esta configurado)
   * y registra una sesion de diagnostico con finalizacion garantizada via `try/finally`.
   * Al cerrar la sesion guarda un snapshot inmutable del resultado.
   *
   * @throws {CognitiveDiagnosisUnavailableError} Si no hay cliente LLM configurado.
   * @throws {DiagnosisScenarioNotFoundError} Si `scenarioId` no existe.
   * @throws {DiagnosisSessionNotFoundError} Si `sessionId` no existe o no pertenece al usuario.
   * @throws {CognitiveDiagnosisTimeoutError} Si se agota `cognitiveTimeoutMs`.
   * @throws {EmptyToolResultError} Si una tool invocada responde sin contenido.
   */
  /**
   * Diagnostico cognitivo con LLM.
   *
   * Delega en {@link CognitiveDiagnosisRunner}, que es donde vive el flujo entero
   * (resolucion de sesion, ejecucion contra el modelo y persistencia del informe).
   *
   * @throws {CognitiveDiagnosisUnavailableError} Si no hay LLM configurado.
   * @throws {CognitiveDiagnosisTimeoutError} Si el modelo no responde a tiempo.
   * @throws {DiagnosisSessionNotFoundError} Si la sesion a continuar no es del usuario.
   */
  async cognitiveDiagnosis(input: {
    scenarioId?: string
    userQuery?: string
    conversationHistory?: readonly LlmConversationItem[]
    userId?: number
    sessionId?: number
  }): Promise<CognitiveDiagnosisResult> {
    return this.cognitiveRunner.run(input)
  }

  /**
   * Invoca una tool MCP concreta y devuelve su texto.
   *
   * @throws {ToolNotFoundError} Si la tool no esta registrada.
   * @throws {DiagnosisScenarioNotFoundError} Si `scenarioId` no existe.
   * @throws {ToolCallTimeoutError} Si se agota el timeout de la llamada.
   * @throws {EmptyToolResultError} Si la tool responde sin contenido.
   */
  async callMcpTool(
    toolName: string,
    scenarioId?: string,
    args?: Record<string, unknown>,
  ): Promise<string> {
    const mcp = this.getMcpServer(scenarioId)
    let result: ToolCallResult
    try {
      result = await withTimeout(
        mcp.callTool(toolName, args ?? {}),
        this.toolCallTimeoutMs,
        'Tool call timed out',
      )
    } catch (err) {
      if (err instanceof ToolNotFoundError) {
        throw err
      }
      if (err instanceof TimeoutError) {
        throw new ToolCallTimeoutError()
      }
      throw err
    }
    return this.firstText(result, toolName)
  }

  /**
   * Extrae el texto del primer bloque de contenido de una tool MCP.
   *
   * El SDK tipa `content` como array, asi que un array vacio es estructuralmente
   * valido: sin esta comprobacion el acceso directo revienta con un `TypeError`
   * que no dice que tool fallo.
   */
  private firstText(result: ToolCallResult, toolName: string): string {
    const first = result.content[0]
    if (!first) throw new EmptyToolResultError(toolName)
    return first.text
  }

  private getMcpServer(scenarioId?: string, sessionContext?: SessionContext) {
    const repository = this.resolveRepository(scenarioId)
    return createMcpServer(
      repository,
      this.vehicleRepo,
      this.knowledgeStack,
      this.webSearch,
      sessionContext,
    )
  }

  private resolveRepository(scenarioId?: string): ObdRepository {
    if (scenarioId) {
      const repo = this.obdRepos.get(scenarioId)
      if (repo) return repo
    }
    if (this.obdRepo) return this.obdRepo
    throw new DiagnosisScenarioNotFoundError()
  }

  private buildDiagnosisText(result: DiagnosisResult): string {
    const description =
      result.dtcCodes.length > 0
        ? result.dtcCodes.map((d) => d.code).join(', ')
        : 'No fault codes detected'

    const base = `[${result.severity.toUpperCase()}] ${description}`
    if (result.freezeFrame) {
      const freezeKeys = result.freezeFrame.pidKeys
        .map((pid) => PID_METADATA.get(pid)?.name ?? pid)
        .join(', ')
      return `${base} (freeze frame: ${result.freezeFrame.dtcCode} → ${freezeKeys})`
    }
    return base
  }
}
