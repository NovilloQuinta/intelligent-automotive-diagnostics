import { ProcessVehicleDiagnosisUseCase } from '@/application/use-cases/ProcessVehicleDiagnosisUseCase.js'
import {
  withTimeout,
  TimeoutError,
  DIAGNOSIS_TIMEOUT_MS,
} from '@/application/shared/withTimeout.js'
import { ExecuteCognitiveDiagnosisUseCase } from '@/application/use-cases/ExecuteCognitiveDiagnosisUseCase.js'
import { createMcpServer, type ToolCallResult } from '@/infrastructure/mcp/mcpServer.js'
import {
  ToolNotFoundError,
  ToolCallTimeoutError,
  EmptyToolResultError,
} from '@/infrastructure/mcp/errors.js'
import {
  DiagnosisScenarioNotFoundError,
  CognitiveDiagnosisUnavailableError,
  CognitiveDiagnosisTimeoutError,
} from '@/infrastructure/services/errors.js'
import type { ObdRepository } from '@/application/ports/ObdRepository.js'
import type { EcuInfo } from '@/domain/entities/ecuInfo.js'
import type { LlmClientPort } from '@/application/ports/LlmClientPort.js'
import type { ToolCallHandler } from '@/application/ports/ToolCallHandler.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import type { DiagnosisResult, Severity } from '@/domain/value-objects/diagnosisResult.js'
import type { FreezeFrame } from '@/domain/value-objects/freezeFrame.js'
import { LiveData } from '@/domain/value-objects/liveData.js'
import type { DtcCode } from '@/domain/value-objects/dtcCode.js'
import { VehicleInfo } from '@/domain/value-objects/vehicleInfo.js'
import type { VehicleStatus } from '@/domain/value-objects/vehicleStatus.js'
import { Vin, FALLBACK_VIN } from '@/domain/value-objects/vin.js'
import type { ExecuteCognitiveDiagnosisOutput } from '@/application/dto/diagnosis/ExecuteCognitiveDiagnosisOutput.js'
import type { LlmConversationItem } from '@/application/dto/llm/LlmMessageInput.js'
import type { KnowledgeStack } from '@/application/ports/KnowledgeStack.js'
import type { WebSearchPort } from '@/application/ports/WebSearchPort.js'
import type { VehicleRepository } from '@/application/ports/VehicleRepository.js'
import { ALL_SEED_PIDS } from '@/infrastructure/persistence/sqlite/seed-pids.js'
import {
  MODE_CURRENT_DATA,
  PID_COOLANT_TEMP,
  PID_RPM,
  PID_SPEED,
  PID_INTAKE_TEMP,
} from '@/domain/pids.js'

const COGNITIVE_DIAGNOSIS_TIMEOUT_MS = 60_000

/** Nombre legible de un PID Mode 01 por su código hex (ej. "0C" → "Engine RPM"). */
const PID_NAMES: Record<string, string> = Object.fromEntries(
  ALL_SEED_PIDS.filter((p) => p.pidCode.mode === MODE_CURRENT_DATA).map((p) => [
    p.pidCode.pid,
    p.name,
  ]),
)

/** Descriptor de un escenario de vehiculo disponible para diagnostico. */
export interface ScenarioDescriptor {
  readonly id: string
  readonly name: string
  readonly vehicleType: 'car' | 'motorcycle' | 'unknown'
  readonly sensorValues?: LiveData
  readonly dtcConfig?: DtcCode[]
  readonly vehicleInfo: VehicleInfo
  /** Host del emulador/dispositivo OBD (no se expone al cliente). */
  readonly host: string
  /** Puerto del emulador/dispositivo OBD (no se expone al cliente). */
  readonly port: number
}

/** Escenario sintetico expuesto cuando se opera contra un ELM327 TCP real.
 * El tipo de vehiculo se descubre al diagnosticar (coche o moto). */
const TCP_DIRECT_SCENARIO: ScenarioDescriptor = {
  id: 'tcp',
  name: 'ELM327 Direct Connection',
  vehicleType: 'unknown',
  sensorValues: new LiveData({ rpm: 0, coolantTemp: 0, speed: 0, intakeTemp: 0 }),
  dtcConfig: [],
  vehicleInfo: new VehicleInfo({
    make: 'unknown',
    model: 'unknown',
    year: 0,
    engineType: 'unknown',
    vin: new Vin(FALLBACK_VIN),
  }),
  host: '',
  port: 0,
}

/** Resultado del diagnostico determinista formateado para la API. */
export interface DiagnoseOutput {
  readonly rawData: string
  readonly parsedValues: LiveData
  readonly dtcCodes: DtcCode[]
  readonly diagnosisText: string
  readonly severity: Severity
}

/** Identificacion del vehiculo activo, con los campos derivados del VO {@link Vin}. */
export interface VehicleInfoOutput {
  readonly vin: string
  readonly make: string
  readonly model: string
  readonly year: number
  readonly engineType: string
  /** Fabricante deducido del WMI; `null` si el VIN no es decodificable. */
  readonly manufacturer: string | null
  /** Pais/region deducidos del WMI; `null` si el VIN no es decodificable. */
  readonly region: { country: string; region: string } | null
  /** Anio de modelo deducido de la posicion 10; `null` si el VIN no es decodificable. */
  readonly modelYearDecoded: number | null
  /** Estado de la lectura del VIN. */
  readonly vinStatus: 'read' | 'unsupported' | 'unreadable'
}

/** Campos decodificados vacios: VIN ausente, con ruido o {@link FALLBACK_VIN}. */
const UNDECODED_VIN = {
  manufacturer: null,
  region: null,
  modelYearDecoded: null,
} as const

/** Telemetria en vivo con degradacion por PID: un valor `null` indica lectura fallida. */
export interface TelemetryOutput {
  rpm: number | null
  coolantTemp: number | null
  speed: number | null
  intakeTemp: number | null
}

/** Dependencias de {@link DiagnosisService}. */
export interface DiagnosisServiceOptions {
  /** Descriptores de escenarios disponibles (modo docker). */
  readonly scenarios: ScenarioDescriptor[]
  /** Mapa scenarioId → repositorio OBD en modo docker (multi-vehiculo). */
  readonly obdRepos?: Map<string, ObdRepository>
  /** Repositorio OBD unico en modo TCP directo (single-vehicle). */
  readonly obdRepo?: ObdRepository
  /** Cliente LLM; ausente deshabilita el diagnostico cognitivo. */
  readonly llmClient?: LlmClientPort
  /** Stack de conocimiento vectorial RAG; ausente deshabilita busqueda/indexado. */
  readonly knowledgeStack?: KnowledgeStack
  /** Puerto de búsqueda web externa; ausente deshabilita la tool `web_search`. */
  readonly webSearch?: WebSearchPort
  /** Repositorio de vehículos; ausente deshabilita `get_available_pids`. */
  readonly vehicleRepo?: VehicleRepository
  readonly logger: LoggerPort
  /** Timeout del diagnostico cognitivo en ms. Por defecto 60 s. */
  readonly cognitiveTimeoutMs?: number
  /** Timeout de una llamada a tool MCP en ms. Por defecto 10 s. */
  readonly toolCallTimeoutMs?: number
}

/** Servicio de orquestacion de diagnostico: resuelve repositorios, crea casos de uso y delega en MCP. */
export class DiagnosisService {
  private readonly scenarios: ScenarioDescriptor[]
  private readonly obdRepos: Map<string, ObdRepository>
  private readonly obdRepo: ObdRepository | undefined
  private readonly llmClient: LlmClientPort | undefined
  private readonly knowledgeStack: KnowledgeStack | undefined
  private readonly webSearch: WebSearchPort | undefined
  private readonly vehicleRepo: VehicleRepository | undefined
  private readonly logger: LoggerPort
  private readonly cognitiveTimeoutMs: number
  private readonly toolCallTimeoutMs: number

  constructor(options: DiagnosisServiceOptions) {
    this.scenarios = options.scenarios
    this.obdRepos = options.obdRepos ?? new Map()
    this.obdRepo = options.obdRepo
    this.llmClient = options.llmClient
    this.knowledgeStack = options.knowledgeStack
    this.webSearch = options.webSearch
    this.vehicleRepo = options.vehicleRepo
    this.logger = options.logger
    this.cognitiveTimeoutMs = options.cognitiveTimeoutMs ?? COGNITIVE_DIAGNOSIS_TIMEOUT_MS
    this.toolCallTimeoutMs = options.toolCallTimeoutMs ?? DIAGNOSIS_TIMEOUT_MS
  }

  /** True cuando se opera contra un unico ELM327 TCP real (scenarioId opcional). */
  get isDirectConnection(): boolean {
    return this.obdRepo !== undefined
  }

  /** True cuando el diagnostico cognitivo esta disponible (LLM configurado). */
  get hasCognitiveDiagnosis(): boolean {
    return this.llmClient !== undefined
  }

  /** Escenarios seleccionables: los del emulador docker, o el sintetico `tcp` en modo directo. */
  listScenarios(): ScenarioDescriptor[] {
    if (this.obdRepo) return [TCP_DIRECT_SCENARIO]
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
   * Lee los 4 PIDs del dashboard en tiempo real con degradacion por PID.
   *
   * Un PID que falla (NO DATA/parse error) llega a `null`; el resto con valor.
   * La cadencia la controla el cliente (1 Hz via `refetchInterval`).
   *
   * @param scenarioId — Escenario; opcional en modo TCP directo.
   * @throws {DiagnosisScenarioNotFoundError} Si `scenarioId` no existe.
   */
  async getLiveData(scenarioId?: string): Promise<TelemetryOutput> {
    const repository = this.resolveRepository(scenarioId)
    const pidToField: Record<string, keyof TelemetryOutput> = {
      [PID_COOLANT_TEMP]: 'coolantTemp',
      [PID_RPM]: 'rpm',
      [PID_SPEED]: 'speed',
      [PID_INTAKE_TEMP]: 'intakeTemp',
    }
    const result: TelemetryOutput = { rpm: null, coolantTemp: null, speed: null, intakeTemp: null }
    for (const [pid, field] of Object.entries(pidToField)) {
      try {
        result[field] = await repository.readPid(MODE_CURRENT_DATA, pid)
      } catch {
        // degradacion por PID: uno que falla no tumba el resto
      }
    }
    return result
  }

  /**
   * Devuelve las ECUs descubiertas en el vehiculo activo.
   *
   * @param scenarioId — Escenario; opcional en modo TCP directo.
   * @throws {DiagnosisScenarioNotFoundError} Si `scenarioId` no existe.
   */
  async getEcuInfo(scenarioId?: string): Promise<EcuInfo[]> {
    const repository = this.resolveRepository(scenarioId)
    return repository.getEcuInfo()
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
    const repository = this.resolveRepository(scenarioId)
    const info = await repository.getVehicleInfo()
    const vin = String(info.vin)
    const vinStatus: VehicleInfoOutput['vinStatus'] =
      info.vinStatus ?? (vin === FALLBACK_VIN ? 'unreadable' : 'read')

    // En modo Docker, fusionar metadatos del descriptor (make/model/year/engineType)
    // con el VIN del ECU. En modo TCP no hay descriptor: se mantiene lo que devuelve el adaptador.
    const descriptor = scenarioId ? this.scenarios.find((s) => s.id === scenarioId) : undefined

    return {
      vin,
      make: descriptor?.vehicleInfo.make ?? info.make,
      model: descriptor?.vehicleInfo.model ?? info.model,
      year: descriptor?.vehicleInfo.year ?? info.year,
      engineType: descriptor?.vehicleInfo.engineType ?? info.engineType,
      vinStatus,
      ...this.decodeVin(vin),
    }
  }

  /**
   * Deriva fabricante/region/anio del VIN reutilizando los getters del VO {@link Vin}.
   *
   * Un VIN ilegible no debe cortar la identificacion: el ELM327 puede devolver
   * ruido y los escenarios de demo usan {@link FALLBACK_VIN}. En ambos casos los
   * campos derivados van a `null` en vez de propagar `VinDecodeError`.
   */
  private decodeVin(raw: string): {
    manufacturer: string | null
    region: { country: string; region: string } | null
    modelYearDecoded: number | null
  } {
    // FALLBACK_VIN es sintacticamente valido (17 'X'), asi que el VO le asignaria
    // un anio de modelo real por la posicion 10. Es un placeholder, no un vehiculo:
    // se descarta antes de decodificar.
    if (raw === FALLBACK_VIN) return UNDECODED_VIN
    try {
      const vin = new Vin(raw)
      return {
        manufacturer: vin.manufacturer,
        region: vin.wmiRegion,
        modelYearDecoded: vin.modelYear,
      }
    } catch {
      return UNDECODED_VIN
    }
  }

  /**
   * Ejecuta el diagnostico cognitivo con tool calling sobre el servidor MCP.
   *
   * @throws {CognitiveDiagnosisUnavailableError} Si no hay cliente LLM configurado.
   * @throws {DiagnosisScenarioNotFoundError} Si `scenarioId` no existe.
   * @throws {CognitiveDiagnosisTimeoutError} Si se agota `cognitiveTimeoutMs`.
   * @throws {EmptyToolResultError} Si una tool invocada responde sin contenido.
   */
  async cognitiveDiagnosis(input: {
    scenarioId?: string
    userQuery?: string
    conversationHistory?: readonly LlmConversationItem[]
  }): Promise<ExecuteCognitiveDiagnosisOutput> {
    const { scenarioId, userQuery, conversationHistory } = input
    if (!this.llmClient) {
      this.logger.warn('Cognitive diagnosis requested but no LLM client is configured')
      throw new CognitiveDiagnosisUnavailableError()
    }
    const llmClient = this.llmClient
    const repository = this.resolveRepository(scenarioId)
    const mcp = this.getMcpServer(scenarioId)
    const tools = mcp.listTools()
    const handler: ToolCallHandler = async (name, args) => {
      const result = await mcp.callTool(name, args)
      return this.firstText(result, name)
    }

    const diagnosis = (async () => {
      const vehicleContext = await repository.getVehicleInfo()
      const useCase = new ExecuteCognitiveDiagnosisUseCase({
        llmClient,
        tools,
        handler,
        logger: this.logger,
        diagnosisIndex: this.knowledgeStack?.diagnosisIndex,
      })
      return useCase.execute({ userQuery, vehicleContext, conversationHistory })
    })()

    try {
      return await withTimeout(diagnosis, this.cognitiveTimeoutMs, 'Cognitive diagnosis timed out')
    } catch (err) {
      if (err instanceof TimeoutError) {
        throw new CognitiveDiagnosisTimeoutError()
      }
      throw err
    }
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

  private getMcpServer(scenarioId?: string) {
    const repository = this.resolveRepository(scenarioId)
    return createMcpServer(repository, this.vehicleRepo, this.knowledgeStack, this.webSearch)
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
      const freezeKeys = result.freezeFrame.pidKeys.map((pid) => PID_NAMES[pid] ?? pid).join(', ')
      return `${base} (freeze frame: ${result.freezeFrame.dtcCode} → ${freezeKeys})`
    }
    return base
  }
}
