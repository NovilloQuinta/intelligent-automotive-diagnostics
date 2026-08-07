import { ObdSimulator } from '@/infrastructure/simulation/simulator.js'
import { ObdSimulatorRepository } from '@/infrastructure/simulation/simulatorAdapter.js'
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
import type { LiveData } from '@/domain/value-objects/liveData.js'
import type { DtcCode } from '@/domain/value-objects/dtcCode.js'
import { Vin, FALLBACK_VIN } from '@/domain/value-objects/vin.js'
import { VehicleType, type SimulationScenario } from '@/infrastructure/simulation/scenario.js'
import type { ExecuteCognitiveDiagnosisOutput } from '@/application/dto/diagnosis/ExecuteCognitiveDiagnosisOutput.js'
import type { DiagnosisVectorRepository } from '@/application/ports/DiagnosisVectorRepository.js'

const COGNITIVE_DIAGNOSIS_TIMEOUT_MS = 60_000

/** Escenario sintetico expuesto cuando se opera contra un ELM327 TCP real. */
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

/** Resultado del diagnostico determinista formateado para la API. */
export interface DiagnoseOutput {
  readonly rawData: string
  readonly parsedValues: LiveData
  readonly dtcCodes: DtcCode[]
  readonly diagnosisText: string
  readonly severity: Severity
}

/** Dependencias de {@link DiagnosisService}. */
export interface DiagnosisServiceOptions {
  /** Escenarios de simulacion disponibles; vacio en modo TCP directo. */
  readonly scenarios: SimulationScenario[]
  /** Repositorio OBD real; presente solo en modo TCP directo. */
  readonly obdRepo?: ObdRepository
  /** Cliente LLM; ausente deshabilita el diagnostico cognitivo. */
  readonly llmClient?: LlmClientPort
  /** Repositorio vectorial RAG; ausente deshabilita la busqueda/indexado de casos. */
  readonly diagnosisIndex?: DiagnosisVectorRepository
  readonly logger: LoggerPort
  /** Timeout del diagnostico cognitivo en ms. Por defecto 60 s. */
  readonly cognitiveTimeoutMs?: number
  /** Timeout de una llamada a tool MCP en ms. Por defecto 10 s. */
  readonly toolCallTimeoutMs?: number
}

/** Servicio de orquestacion de diagnostico: resuelve repositorios, crea casos de uso y delega en MCP. */
export class DiagnosisService {
  private readonly scenarios: SimulationScenario[]
  private readonly obdRepo: ObdRepository | undefined
  private readonly llmClient: LlmClientPort | undefined
  private readonly diagnosisIndex: DiagnosisVectorRepository | undefined
  private readonly logger: LoggerPort
  private readonly cognitiveTimeoutMs: number
  private readonly toolCallTimeoutMs: number

  constructor(options: DiagnosisServiceOptions) {
    this.scenarios = options.scenarios
    this.obdRepo = options.obdRepo
    this.llmClient = options.llmClient
    this.diagnosisIndex = options.diagnosisIndex
    this.logger = options.logger
    this.cognitiveTimeoutMs = options.cognitiveTimeoutMs ?? COGNITIVE_DIAGNOSIS_TIMEOUT_MS
    this.toolCallTimeoutMs = options.toolCallTimeoutMs ?? DIAGNOSIS_TIMEOUT_MS
  }

  /** True cuando se opera contra un ELM327 TCP real (modo directo, sin scenarios). */
  get isDirectConnection(): boolean {
    return this.obdRepo !== undefined
  }

  /** True cuando hay un cliente LLM configurado para diagnostico cognitivo. */
  get hasCognitiveDiagnosis(): boolean {
    return this.llmClient !== undefined
  }

  /** Escenarios seleccionables: los de simulacion, o el sintetico `tcp` en modo directo. */
  listScenarios(): SimulationScenario[] {
    return this.obdRepo ? [TCP_DIRECT_SCENARIO] : this.scenarios
  }

  /**
   * Ejecuta el diagnostico determinista sobre un escenario.
   *
   * @throws {DiagnosisScenarioNotFoundError} Si `scenarioId` no existe en modo simulacion.
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
   * @param scenarioId — Escenario de simulacion; opcional en modo TCP directo.
   * @param dtc — Codigo DTC opcional; si se omite, devuelve el del escenario.
   * @throws {DiagnosisScenarioNotFoundError} Si `scenarioId` no existe en modo simulacion.
   */
  async getFreezeFrame(scenarioId?: string, dtc?: string): Promise<FreezeFrame | null> {
    const repository = this.resolveRepository(scenarioId)
    return repository.getFreezeFrame(dtc)
  }

  /**
   * Devuelve las ECUs descubiertas en el vehiculo activo.
   *
   * @param scenarioId — Escenario de simulacion; opcional en modo TCP directo.
   * @throws {DiagnosisScenarioNotFoundError} Si `scenarioId` no existe en modo simulacion.
   */
  async getEcuInfo(scenarioId?: string): Promise<EcuInfo[]> {
    const repository = this.resolveRepository(scenarioId)
    return repository.getEcuInfo()
  }

  /**
   * Ejecuta el diagnostico cognitivo con tool calling sobre el servidor MCP.
   *
   * @throws {CognitiveDiagnosisUnavailableError} Si no hay cliente LLM configurado.
   * @throws {DiagnosisScenarioNotFoundError} Si `scenarioId` no existe en modo simulacion.
   * @throws {CognitiveDiagnosisTimeoutError} Si se agota `cognitiveTimeoutMs`.
   * @throws {EmptyToolResultError} Si una tool invocada responde sin contenido.
   */
  async cognitiveDiagnosis(input: {
    scenarioId?: string
    userQuery?: string
  }): Promise<ExecuteCognitiveDiagnosisOutput> {
    const { scenarioId, userQuery } = input
    if (!this.llmClient) {
      this.logger.warn('Cognitive diagnosis requested but no LLM client is configured')
      throw new CognitiveDiagnosisUnavailableError()
    }
    const llmClient = this.llmClient
    const repository = this.resolveRepository(scenarioId)
    const mcp = createMcpServer(repository)
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
        diagnosisIndex: this.diagnosisIndex,
      })
      return useCase.execute({ userQuery, vehicleContext })
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
   * @throws {DiagnosisScenarioNotFoundError} Si `scenarioId` no existe en modo simulacion.
   * @throws {ToolCallTimeoutError} Si se agota el timeout de la llamada.
   * @throws {EmptyToolResultError} Si la tool responde sin contenido.
   */
  async callMcpTool(
    toolName: string,
    scenarioId?: string,
    args?: Record<string, unknown>,
  ): Promise<string> {
    const repository = this.resolveRepository(scenarioId)
    const mcp = createMcpServer(repository)
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

  private resolveRepository(scenarioId?: string): ObdRepository {
    if (this.obdRepo) return this.obdRepo
    const scenario = this.scenarios.find((s) => s.id === scenarioId)
    if (!scenario) throw new DiagnosisScenarioNotFoundError()
    return new ObdSimulatorRepository(new ObdSimulator(scenario))
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
