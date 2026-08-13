import { ProcessVehicleDiagnosisUseCase } from '@/application/use-cases/ProcessVehicleDiagnosisUseCase.js'
import {
  withTimeout,
  TimeoutError,
  DIAGNOSIS_TIMEOUT_MS,
} from '@/application/shared/withTimeout.js'
import { ExecuteCognitiveDiagnosisUseCase } from '@/application/use-cases/ExecuteCognitiveDiagnosisUseCase.js'
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
  CognitiveDiagnosisUnavailableError,
  CognitiveDiagnosisTimeoutError,
  DiagnosisSessionNotFoundError,
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
import type {
  VehicleRepository,
  SessionResultSnapshot,
} from '@/application/ports/VehicleRepository.js'
import type {
  DiagnosisSessionFilter,
  DiagnosisSessionPage,
} from '@/application/ports/VehicleRepository.js'
import { VehicleProfile } from '@/domain/entities/vehicleProfile.js'
import { DiagnosisSession } from '@/domain/entities/diagnosisSession.js'
import type { SessionSeverity } from '@/domain/entities/diagnosisSession.js'
import { ALL_SEED_PIDS } from '@/infrastructure/persistence/sqlite/seed-pids.js'
import { normalizeManufacturer } from '@/domain/value-objects/manufacturer.js'
import {
  MODE_CURRENT_DATA,
  PID_COOLANT_TEMP,
  PID_RPM,
  PID_SPEED,
  PID_INTAKE_TEMP,
  DEFAULT_LIVE_PIDS,
} from '@/domain/pids.js'

const COGNITIVE_DIAGNOSIS_TIMEOUT_MS = 60_000

/**
 * Metadatos de presentación (nombre + unidad) de los PIDs Mode 01 del catálogo
 * {@link ALL_SEED_PIDS}, indexados por código hex (ej. "0C" → "Engine RPM"/"rpm").
 *
 * Se usa `ALL_SEED_PIDS` (en inglés, SAE J1979) y no `PID_OBSERVATION_CATALOG`
 * (español) porque este último solo define 7 PIDs y la respuesta genérica
 * `readings` debe cubrir los 16 Mode 01 para poder mostrar un gauge por PID.
 */
const PID_METADATA: ReadonlyMap<string, { readonly name: string; readonly unit: string }> = new Map(
  ALL_SEED_PIDS.filter((p) => p.pidCode.mode === MODE_CURRENT_DATA).map((p) => [
    p.pidCode.pid,
    { name: p.name, unit: p.unit ?? '' },
  ]),
)

/** Nombre de la tool MCP que devuelve los códigos DTC detectados en el vehículo. */
const GET_DTC_CODES_TOOL = 'get_dtc_codes'

/** Descriptor de un escenario de vehiculo disponible para diagnostico. */
export interface ScenarioDescriptor {
  readonly id: string
  readonly name: string
  readonly vehicleType: 'car' | 'motorcycle' | 'unknown'
  /** Tipo de conexión al dispositivo: WiFi (TCP/IP), USB (serial), o Bluetooth (RFCOMM — futuro). */
  readonly connectionType: 'wifi' | 'usb' | 'bluetooth'
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
  connectionType: 'wifi',
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

/** Escenario sintetico expuesto cuando se opera contra un ELM327 USB/serial real. */
export const SERIAL_DIRECT_SCENARIO: ScenarioDescriptor = {
  id: 'serial',
  name: 'ELM327 USB Connection',
  vehicleType: 'unknown',
  connectionType: 'usb',
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

/** Lectura genérica de un PID en la respuesta `readings` de {@link DiagnosisService.getLiveData}. */
export interface PidReading {
  /** Clave compuesta modo + PID separados por espacio (ej. "01 0C"). */
  readonly code: string
  /** Nombre legible del PID (del catálogo `ALL_SEED_PIDS`). */
  readonly name: string
  /** Unidad física del valor (ej. "rpm", "°C"). */
  readonly unit: string
  /** Valor físico resuelto; `null` si la lectura falló (NO DATA). */
  readonly value: number | null
}

/** PID Mode 01 disponible en el selector de telemetría en vivo. */
export interface AvailablePid {
  /** Clave compuesta modo + PID separados por espacio (ej. "01 0C"). */
  readonly code: string
  /** Nombre legible del PID (del catálogo `ALL_SEED_PIDS`). */
  readonly name: string
  /** Unidad física del valor (ej. "rpm", "°C"). */
  readonly unit: string
}

/** Rol de un turno dentro de la conversación persistida del diagnóstico. */
type ConversationRole = 'user' | 'assistant'

/** Turno individual de la conversación entre mecánico y asistente IA. */
interface ConversationTurn {
  readonly role: ConversationRole
  readonly text: string
  readonly timestamp: string
}

/** Construye un turno de conversación inmutable con marca de tiempo actual. */
function buildConversationTurn(role: ConversationRole, text: string): ConversationTurn {
  return { role, text, timestamp: new Date().toISOString() }
}

/** Resultado del diagnóstico cognitivo, enriquecido con el id de la sesión persistida. */
export type CognitiveDiagnosisResult = ExecuteCognitiveDiagnosisOutput & {
  readonly sessionId?: number
}

/** Estado de sesión resuelto antes de ejecutar el diagnóstico cognitivo. */
interface ResolvedDiagnosisSession {
  readonly followUpSession: DiagnosisSession | undefined
  readonly sessionId: number | undefined
  readonly vehicleId: number | undefined
}

/** Dependencias de {@link DiagnosisService}. */
export interface DiagnosisServiceOptions {
  /** Descriptores de escenarios disponibles (modo docker). */
  readonly scenarios: ScenarioDescriptor[]
  /** Mapa scenarioId → repositorio OBD en modo docker (multi-vehiculo). */
  readonly obdRepos?: Map<string, ObdRepository>
  /** Repositorio OBD unico en modo TCP directo (single-vehicle). */
  readonly obdRepo?: ObdRepository
  /** Escenario sintetico a devolver en `listScenarios()` cuando `obdRepo` está presente.
   *  Por defecto {@link TCP_DIRECT_SCENARIO}. Usar {@link SERIAL_DIRECT_SCENARIO} para USB. */
  readonly directScenario?: ScenarioDescriptor
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
  private readonly directScenario: ScenarioDescriptor
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
    this.directScenario = options.directScenario ?? TCP_DIRECT_SCENARIO
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
  async getLiveData(
    scenarioId?: string,
    pids?: readonly string[],
  ): Promise<Partial<TelemetryOutput> & { readonly readings: PidReading[] }> {
    const repository = this.resolveRepository(scenarioId)
    const requested = (pids && pids.length > 0 ? pids : DEFAULT_LIVE_PIDS).map((pid) =>
      pid.toUpperCase(),
    )
    const values = await repository.readPids(MODE_CURRENT_DATA, requested)

    const pidToField: Record<string, keyof TelemetryOutput> = {
      [PID_COOLANT_TEMP]: 'coolantTemp',
      [PID_RPM]: 'rpm',
      [PID_SPEED]: 'speed',
      [PID_INTAKE_TEMP]: 'intakeTemp',
    }
    const result: Partial<TelemetryOutput> = {}
    const readings: PidReading[] = []
    for (const pid of requested) {
      const field = pidToField[pid]
      if (field) result[field] = values.get(pid) ?? null
      const metadata = PID_METADATA.get(pid)
      readings.push({
        code: `${MODE_CURRENT_DATA} ${pid}`,
        name: metadata?.name ?? pid,
        unit: metadata?.unit ?? '',
        value: values.get(pid) ?? null,
      })
    }
    return { ...result, readings }
  }

  /**
   * Lista los PIDs Mode 01 del catalogo SAE J1979 disponibles para el selector
   * de telemetria en vivo.
   *
   * Es un catalogo global (no depende del vehiculo conectado): si un coche no
   * soporta un PID, la lectura degrada a `null` en {@link getLiveData} y el
   * gauge muestra `—`.
   *
   * @returns Los 16 PIDs Mode 01 con su nombre y unidad, en orden de catalogo.
   */
  listAvailablePids(): AvailablePid[] {
    return Array.from(PID_METADATA.entries()).map(([pid, meta]) => ({
      code: `${MODE_CURRENT_DATA} ${pid}`,
      name: meta.name,
      unit: meta.unit,
    }))
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
   * Convierte un value object {@link VehicleInfo} al perfil de entidad {@link VehicleProfile}
   * requerido por {@link VehicleRepository.upsertVehicle}.
   *
   * `id: 0` indica clave autogenerada en la capa de persistencia.
   */
  private toVehicleProfile(vehicleInfo: VehicleInfo): VehicleProfile {
    return new VehicleProfile({
      id: 0,
      vin: new Vin(vehicleInfo.vin.value),
      make: vehicleInfo.make,
      model: vehicleInfo.model,
      year: vehicleInfo.year,
      engineType: vehicleInfo.engineType,
    })
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
  async cognitiveDiagnosis(input: {
    scenarioId?: string
    userQuery?: string
    conversationHistory?: readonly LlmConversationItem[]
    userId?: number
    sessionId?: number
  }): Promise<CognitiveDiagnosisResult> {
    const { scenarioId, userQuery, conversationHistory, userId, sessionId } = input
    const repository = this.resolveRepository(scenarioId)
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
   */
  private async upsertVehicleForDiagnosis(vehicleInfo: VehicleInfo): Promise<number | undefined> {
    if (!this.vehicleRepo) return undefined
    try {
      const profile = this.toVehicleProfile(vehicleInfo)
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
    const mcp = this.getMcpServer(scenarioId, session)
    const handler: ToolCallHandler = async (name, args) => {
      const result = await mcp.callTool(name, args)
      return this.firstText(result, name)
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
      const snapshot = this.buildFollowUpSnapshot(
        input.vehicleInfo,
        followUpSession.resultJson,
        input.userQuery,
        input.diagnosisResult,
      )
      void this.vehicleRepo
        .updateSessionResult(sessionId, snapshot)
        .catch((e) => this.logger.warn('Failed to update diagnosis session with snapshot', e))
      return
    }
    const snapshot = this.buildDiagnosisSnapshot(input.vehicleInfo, input.diagnosisResult)
    void this.vehicleRepo
      .endSession(sessionId, snapshot ?? undefined)
      .catch((e) => this.logger.warn('Failed to end diagnosis session with snapshot', e))
  }

  /**
   * Construye el snapshot inmutable del diagnostico para almacenar en `resultJson`.
   *
   * Incluye identidad del vehiculo, DTCs extraidos de las tools, freeze frame,
   * y el veredicto completo del LLM (narrativa, severidad, confianza y recomendaciones).
   * El snapshot es inmutable: si cambian catalogos, formulas o prompts en el futuro,
   * este informe conserva lo que el mecanico vio ese dia (ver design.md Decision 1).
   */
  private buildDiagnosisSnapshot(
    vehicleInfo: VehicleInfo,
    diagnosis?: ExecuteCognitiveDiagnosisOutput,
  ): SessionResultSnapshot | null {
    if (!diagnosis) return null
    return this.buildSnapshot(vehicleInfo, diagnosis, [
      buildConversationTurn('assistant', diagnosis.diagnosis),
    ])
  }

  /**
   * Construye el snapshot de un follow-up reutilizando la conversación previa.
   *
   * Lee los turnos ya persistidos en `result_json`, añade la pregunta del mecánico
   * (si la hay) y la nueva respuesta del asistente, y serializa el snapshot completo.
   */
  private buildFollowUpSnapshot(
    vehicleInfo: VehicleInfo,
    previousResultJson: string | undefined,
    userQuery: string | undefined,
    diagnosis: ExecuteCognitiveDiagnosisOutput,
  ): SessionResultSnapshot {
    const turns = [...this.parseConversation(previousResultJson)]
    if (userQuery) {
      turns.push(buildConversationTurn('user', userQuery))
    }
    turns.push(buildConversationTurn('assistant', diagnosis.diagnosis))
    return this.buildSnapshot(vehicleInfo, diagnosis, turns)
  }

  /** Serializa el snapshot inmutable con la conversación dada. */
  private buildSnapshot(
    vehicleInfo: VehicleInfo,
    diagnosis: ExecuteCognitiveDiagnosisOutput,
    conversation: ConversationTurn[],
  ): SessionResultSnapshot {
    const dtcCount = this.countDtcsFromToolCalls(diagnosis.toolCalls)
    const severity: SessionSeverity = (diagnosis.severity as SessionSeverity) ?? 'low'

    const snapshot = {
      vehicle: {
        vin: vehicleInfo.vin.value,
        make: vehicleInfo.make,
        model: vehicleInfo.model,
        year: vehicleInfo.year,
        engineType: vehicleInfo.engineType,
      },
      diagnosis: {
        severity: diagnosis.severity,
        confidence: diagnosis.confidence,
        narrative: diagnosis.diagnosis,
        recommendations: diagnosis.recommendations,
        toolCalls: diagnosis.toolCalls,
      },
      conversation,
      timestamp: new Date().toISOString(),
    }

    return {
      resultJson: JSON.stringify(snapshot),
      severity,
      dtcCount,
    }
  }

  /**
   * Recupera los turnos de conversación de un `result_json` previo.
   *
   * Devuelve `[]` si no hay snapshot previo o si el JSON no es parseable, de modo
   * que un follow-up sobre una sesión sin conversación no rompe el diagnóstico.
   */
  private parseConversation(resultJson: string | undefined): ConversationTurn[] {
    if (!resultJson) return []
    try {
      const parsed = JSON.parse(resultJson) as { conversation?: ConversationTurn[] }
      return Array.isArray(parsed.conversation) ? parsed.conversation : []
    } catch {
      this.logger.warn('Failed to parse previous diagnosis snapshot conversation')
      return []
    }
  }

  /** Cuenta DTCs unicos extraidos de las tool calls {@link GET_DTC_CODES_TOOL}. */
  private countDtcsFromToolCalls(
    toolCalls?: ReadonlyArray<{ readonly tool: string; readonly result: string }>,
  ): number {
    if (!toolCalls) return 0
    const dtcToolResult = toolCalls.find((t) => t.tool === GET_DTC_CODES_TOOL)?.result
    if (!dtcToolResult) return 0
    // El resultado es tipo "P0301: Cylinder 1 Misfire, P0420: Catalyst..."
    return dtcToolResult.split(',').filter((s) => /[A-Z]\d{4}/.test(s.trim())).length
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
