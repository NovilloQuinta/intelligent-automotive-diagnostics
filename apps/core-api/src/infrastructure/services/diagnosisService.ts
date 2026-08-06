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
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import type { DiagnosisResult, Severity } from '@/domain/value-objects/diagnosisResult.js'
import type { LiveData } from '@/domain/value-objects/liveData.js'
import type { DtcCode } from '@/domain/value-objects/dtcCode.js'
import { Vin, FALLBACK_VIN } from '@/domain/value-objects/vin.js'
import { VehicleType, type SimulationScenario } from '@/infrastructure/simulation/scenario.js'
import type { ExecuteCognitiveDiagnosisOutput } from '@/application/dto/ExecuteCognitiveDiagnosisOutput.js'

const COGNITIVE_DIAGNOSIS_TIMEOUT_MS = 60_000

/** Error lanzado cuando el escenario de diagnostico no existe. */
export class DiagnosisScenarioNotFoundError extends Error {
  constructor(message: string = 'Scenario not found') {
    super(message)
    this.name = 'DiagnosisScenarioNotFoundError'
  }
}

/** Error lanzado cuando el diagnostico cognitivo no esta disponible (sin LLM configurado). */
export class CognitiveDiagnosisUnavailableError extends Error {
  constructor(message: string = 'Cognitive diagnosis is not available') {
    super(message)
    this.name = 'CognitiveDiagnosisUnavailableError'
  }
}

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

/** Servicio de orquestacion de diagnostico: resuelve repositorios, crea casos de uso y delega en MCP. */
export class DiagnosisService {
  constructor(
    private readonly scenarios: SimulationScenario[],
    private readonly obdRepo: ObdRepository | undefined,
    private readonly llmClient: LlmClientPort | undefined,
    private readonly logger: LoggerPort,
  ) {}

  listScenarios(): SimulationScenario[] {
    return this.obdRepo ? [TCP_DIRECT_SCENARIO] : this.scenarios
  }

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
      return result.content[0].text
    }

    const diagnosis = (async () => {
      const vehicleContext = await repository.getVehicleInfo()
      const useCase = new ExecuteCognitiveDiagnosisUseCase(llmClient, tools, handler)
      return useCase.execute({ userQuery, vehicleContext })
    })()

    return withTimeout(
      diagnosis,
      COGNITIVE_DIAGNOSIS_TIMEOUT_MS,
      'Cognitive diagnosis timed out',
    )
  }

  async callMcpTool(
    toolName: string,
    scenarioId?: string,
    args?: Record<string, unknown>,
  ): Promise<string> {
    const repository = this.resolveRepository(scenarioId)
    const mcp = createMcpServer(repository)
    const result = await withTimeout(
      mcp.callTool(toolName, args ?? {}),
      DIAGNOSIS_TIMEOUT_MS,
      'Tool call timed out',
    )
    return result.content[0].text
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
