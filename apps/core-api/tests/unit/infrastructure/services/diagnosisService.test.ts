import { describe, it, expect, vi } from 'vitest'
import {
  DiagnosisService,
  DiagnosisScenarioNotFoundError,
  CognitiveDiagnosisUnavailableError,
} from '@/infrastructure/services/diagnosisService.js'
import { Vin } from '@/domain/value-objects/vin.js'
import { VehicleType, type SimulationScenario } from '@/infrastructure/simulation/scenario.js'
import type { ObdRepository } from '@/application/ports/ObdRepository.js'
import type { LlmClientPort, ToolCallTrace } from '@/application/ports/LlmClientPort.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'

const mockScenarios: SimulationScenario[] = [
  {
    id: 'audi-a3-idle',
    name: 'Audi A3 al ralenti',
    vehicleType: VehicleType.Car,
    sensorValues: { rpm: 750, coolantTemp: 90, speed: 0, intakeTemp: 25 },
    dtcConfig: [{ code: 'P0301', description: 'Cylinder 1 Misfire' }],
    vehicleInfo: {
      make: 'Audi',
      model: 'A3',
      year: 2018,
      engineType: '2.0 TFSI',
      vin: new Vin('WAUZZZ8V5JA123456'),
    },
  },
  {
    id: 'kawa-z900',
    name: 'Kawasaki Z900',
    vehicleType: VehicleType.Motorcycle,
    sensorValues: { rpm: 4500, coolantTemp: 105, speed: 0, intakeTemp: 28 },
    dtcConfig: [],
    vehicleInfo: {
      make: 'Kawasaki',
      model: 'Z900',
      year: 2020,
      engineType: '948cc Inline-4',
      vin: new Vin('JKAZR2A1XLA000111'),
    },
  },
]

/** Helper: crea un mock de LoggerPort con spies para cada nivel. */
function createMockLogger(): LoggerPort {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}

/** Repositorio OBD mockeado (modo TCP): RPM 800, coolant 90, DTC P0301. */
function createMockObdRepo(): ObdRepository {
  return {
    readPid: vi.fn(async (_mode: string, pid: string) => (pid === '0C' ? 800 : 90)),
    getSupportedPids: vi.fn(async () => ['01 0C']),
    getFreezeFrame: vi.fn(async () => null),
    readDtcCodes: vi.fn(async () => [{ code: 'P0301', description: '' }]),
    clearDtcCodes: vi.fn(async () => undefined),
    readVin: vi.fn(async () => 'WAUZZZ8V5JA123456'),
    getVehicleInfo: vi.fn(async () => ({
      make: 'Audi',
      model: 'unknown',
      year: 2018,
      engineType: 'unknown',
      vin: new Vin('WAUZZZ8V5JA123456'),
    })),
    setPower: vi.fn(async () => undefined),
  }
}

/** Cliente LLM mockeado con sendMessage controlable. */
function mockLlmClient(overrides: Partial<LlmClientPort> = {}): LlmClientPort {
  return {
    sendMessage: vi.fn(),
    ...overrides,
  }
}

const cognitiveText =
  'El motor tiembla en ralentí por fallo de encendido. ---JSON---{"severity":"high","confidence":0.9,"recommendations":["Revisar bujías","Cambiar bobina"]}---'
const cognitiveToolCalls: ToolCallTrace[] = [
  { tool: 'read_pid', args: { mode: '01', pid: '0C' }, result: '750' },
  { tool: 'get_dtc_codes', args: {}, result: 'P0301: Cylinder 1 Misfire' },
]

describe('DiagnosisService', () => {
  describe('listScenarios', () => {
    it('should return the constructor scenarios in simulation mode', () => {
      const service = new DiagnosisService(mockScenarios, undefined, undefined, createMockLogger())

      const list = service.listScenarios()

      expect(list).toHaveLength(2)
      expect(list[0].id).toBe('audi-a3-idle')
    })

    it('should return the synthetic tcp scenario in TCP mode', () => {
      const service = new DiagnosisService(
        mockScenarios,
        createMockObdRepo(),
        undefined,
        createMockLogger(),
      )

      const list = service.listScenarios()

      expect(list).toHaveLength(1)
      expect(list[0]).toMatchObject({ id: 'tcp', name: 'ELM327 Direct Connection' })
    })
  })

  describe('diagnose', () => {
    it('should run a full diagnosis for an existing simulation scenario', async () => {
      const service = new DiagnosisService(mockScenarios, undefined, undefined, createMockLogger())

      const result = await service.diagnose('audi-a3-idle')

      expect(result.parsedValues.rpm).toBe(750)
      expect(result.parsedValues.coolantTemp).toBe(90)
      expect(result.dtcCodes).toHaveLength(1)
      expect(result.dtcCodes[0].code).toBe('P0301')
      expect(result.severity).toBe('high')
      expect(result.diagnosisText).toContain('[HIGH] P0301')
      expect(result.rawData).toContain('750')
    })

    it('should throw DiagnosisScenarioNotFoundError for an unknown scenario', async () => {
      const service = new DiagnosisService(mockScenarios, undefined, undefined, createMockLogger())

      await expect(service.diagnose('nonexistent')).rejects.toThrow(DiagnosisScenarioNotFoundError)
    })

    it('should use the injected obdRepo directly in TCP mode', async () => {
      const obdRepo = createMockObdRepo()
      const service = new DiagnosisService(mockScenarios, obdRepo, undefined, createMockLogger())

      const result = await service.diagnose()

      expect(result.parsedValues.rpm).toBe(800)
      expect(result.parsedValues.coolantTemp).toBe(90)
      expect(result.dtcCodes).toEqual([{ code: 'P0301', description: '' }])
      expect(result.severity).toBe('high')
    })
  })

  describe('cognitiveDiagnosis', () => {
    it('should throw CognitiveDiagnosisUnavailableError without an llmClient', async () => {
      const service = new DiagnosisService(mockScenarios, undefined, undefined, createMockLogger())

      await expect(service.cognitiveDiagnosis({ scenarioId: 'audi-a3-idle' })).rejects.toThrow(
        CognitiveDiagnosisUnavailableError,
      )
    })

    it('should run the cognitive use case and return the parsed output', async () => {
      const llmClient = mockLlmClient({
        sendMessage: vi
          .fn()
          .mockResolvedValue({ text: cognitiveText, toolCalls: cognitiveToolCalls }),
      })
      const service = new DiagnosisService(mockScenarios, undefined, llmClient, createMockLogger())

      const result = await service.cognitiveDiagnosis({
        scenarioId: 'audi-a3-idle',
        userQuery: '¿Por qué tiembla el motor al ralentí?',
      })

      expect(result.diagnosis).toBe(cognitiveText)
      expect(result.severity).toBe('high')
      expect(result.confidence).toBe(0.9)
      expect(result.recommendations).toEqual(['Revisar bujías', 'Cambiar bobina'])
      expect(result.toolCalls).toEqual(cognitiveToolCalls)
      expect(llmClient.sendMessage).toHaveBeenCalledTimes(1)
      const input = (llmClient.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(input.tools).toHaveLength(6)
      expect(input.userMessage).toContain('Audi A3')
    })

    it('should throw DiagnosisScenarioNotFoundError for an unknown scenario', async () => {
      const llmClient = mockLlmClient({
        sendMessage: vi
          .fn()
          .mockResolvedValue({ text: cognitiveText, toolCalls: cognitiveToolCalls }),
      })
      const service = new DiagnosisService(mockScenarios, undefined, llmClient, createMockLogger())

      await expect(service.cognitiveDiagnosis({ scenarioId: 'no-existe' })).rejects.toThrow(
        DiagnosisScenarioNotFoundError,
      )
      expect(llmClient.sendMessage).not.toHaveBeenCalled()
    })
  })

  describe('callMcpTool', () => {
    it('should call the MCP tool and return its text result', async () => {
      const service = new DiagnosisService(mockScenarios, undefined, undefined, createMockLogger())

      const result = await service.callMcpTool('read_pid', 'audi-a3-idle', {
        mode: '01',
        pid: '0C',
      })

      expect(result).toBe('750')
    })

    it('should throw when the tool does not exist', async () => {
      const service = new DiagnosisService(mockScenarios, undefined, undefined, createMockLogger())

      await expect(service.callMcpTool('bogus_tool', 'audi-a3-idle')).rejects.toThrow(
        'Tool not found: bogus_tool',
      )
    })
  })
})
