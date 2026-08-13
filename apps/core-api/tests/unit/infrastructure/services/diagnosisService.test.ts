import { describe, it, expect, vi } from 'vitest'
import { DiagnosisService } from '@/infrastructure/services/diagnosisService.js'
import {
  DiagnosisScenarioNotFoundError,
  CognitiveDiagnosisUnavailableError,
  DiagnosisSessionNotFoundError,
} from '@/infrastructure/services/errors.js'
import { EcuInfo } from '@/domain/entities/ecuInfo.js'
import { Vin, FALLBACK_VIN } from '@/domain/value-objects/vin.js'
import { FreezeFrame } from '@/domain/value-objects/freezeFrame.js'
import { VehicleStatus } from '@/domain/value-objects/vehicleStatus.js'
import { VehicleType, type SimulationScenario } from '@/infrastructure/simulation/scenario.js'
import { VehicleProfile } from '@/domain/entities/vehicleProfile.js'
import { DiagnosisSession } from '@/domain/entities/diagnosisSession.js'
import type { ObdRepository } from '@/application/ports/ObdRepository.js'
import type { LlmClientPort, ToolCallTrace } from '@/application/ports/LlmClientPort.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import type { KnowledgeStack } from '@/application/ports/KnowledgeStack.js'
import type { PidVectorRepository } from '@/application/ports/PidVectorRepository.js'
import type { DtcVectorRepository } from '@/application/ports/DtcVectorRepository.js'
import type { DiagnosisVectorRepository } from '@/application/ports/DiagnosisVectorRepository.js'
import type { EcuVectorRepository } from '@/application/ports/EcuVectorRepository.js'
import type { VehicleRepository } from '@/application/ports/VehicleRepository.js'

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
function createMockObdRepo(sensorOverrides?: {
  rpm?: number
  coolantTemp?: number
  ecus?: EcuInfo[]
}): ObdRepository {
  return {
    readPid: vi.fn(async (_mode: string, pid: string) => {
      if (pid === '0C') return sensorOverrides?.rpm ?? 800
      if (pid === '05') return sensorOverrides?.coolantTemp ?? 90
      return 90
    }),
    readPids: vi.fn(async () => new Map<string, number>()),
    readPidRaw: vi.fn(async () => [0x00, 0x00]),
    getSupportedPids: vi.fn(async () => ['01 0C']),
    getFreezeFrame: vi.fn(async () => null),
    readDtcCodes: vi.fn(async () => [{ code: 'P0301', description: '' }]),
    clearDtcCodes: vi.fn(async () => undefined),
    readPendingDtcCodes: vi.fn(async () => [{ code: 'P0301', description: 'Cylinder 1 Misfire' }]),
    readPermanentDtcCodes: vi.fn(async () => [
      { code: 'P0401', description: 'EGR Flow Insufficient' },
    ]),
    readVin: vi.fn(async () => 'WAUZZZ8V5JA123456'),
    getVehicleInfo: vi.fn(async () => ({
      make: 'Audi',
      model: 'A3',
      year: 2018,
      engineType: 'unknown',
      vin: new Vin('WAUZZZ8V5JA123456'),
    })),
    setPower: vi.fn(async () => undefined),
    getEcuInfo: vi.fn(async () => sensorOverrides?.ecus ?? []),
    getVehicleStatus: vi.fn(async () => VehicleStatus.clean('spark')),
  }
}

/** Crea un mapa de scenarioId → ObdRepository para los mockScenarios con valores realistas. */
function createMockObdRepos(): Map<string, ObdRepository> {
  return new Map([
    ['audi-a3-idle', createMockObdRepo({ rpm: 750, coolantTemp: 90 })],
    ['kawa-z900', createMockObdRepo({ rpm: 4500, coolantTemp: 105 })],
  ])
}

/** Cliente LLM mockeado con sendMessage controlable. */
function mockLlmClient(overrides: Partial<LlmClientPort> = {}): LlmClientPort {
  return {
    sendMessage: vi.fn(),
    ...overrides,
  }
}

/** Repositorio de vehículos mockeado con todos los métodos requeridos por la interfaz. */
function createMockVehicleRepo(overrides?: Partial<VehicleRepository>): VehicleRepository {
  return {
    upsertVehicle: vi.fn(),
    findVehicleByVin: vi.fn().mockResolvedValue(null),
    insertEcu: vi.fn(),
    findEcusByVehicle: vi.fn().mockResolvedValue([]),
    insertPidDefinition: vi.fn(),
    findPidDefinition: vi.fn().mockResolvedValue(null),
    findPidsByVehicle: vi.fn().mockResolvedValue([]),
    insertPidReading: vi.fn(),
    createSession: vi.fn(),
    endSession: vi.fn().mockResolvedValue(undefined),
    updateSessionResult: vi.fn().mockResolvedValue(undefined),
    findSessions: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    findSessionById: vi.fn().mockResolvedValue(null),
    findDtcDefinition: vi.fn().mockResolvedValue(null),
    upsertDtcDefinition: vi.fn(),
    findEcuByAddress: vi.fn().mockResolvedValue(null),
    updateEcuDiscoveredAt: vi.fn(),
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
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        logger: createMockLogger(),
      })

      const list = service.listScenarios()

      expect(list).toHaveLength(2)
      expect(list[0].id).toBe('audi-a3-idle')
    })

    it('should return the synthetic tcp scenario in TCP mode', () => {
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        obdRepo: createMockObdRepo(),
        logger: createMockLogger(),
      })

      const list = service.listScenarios()

      expect(list).toHaveLength(1)
      expect(list[0]).toMatchObject({ id: 'tcp', name: 'ELM327 Direct Connection' })
    })
  })

  describe('diagnose', () => {
    it('should run a full diagnosis for an existing simulation scenario', async () => {
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        logger: createMockLogger(),
      })

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
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        logger: createMockLogger(),
      })

      await expect(service.diagnose('nonexistent')).rejects.toThrow(DiagnosisScenarioNotFoundError)
    })

    it('should use the injected obdRepo directly in TCP mode', async () => {
      const obdRepo = createMockObdRepo()
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        obdRepo,
        logger: createMockLogger(),
      })

      const result = await service.diagnose()

      expect(result.parsedValues.rpm).toBe(800)
      expect(result.parsedValues.coolantTemp).toBe(90)
      expect(result.dtcCodes).toEqual([{ code: 'P0301', description: '' }])
      expect(result.severity).toBe('high')
    })
  })

  describe('cognitiveDiagnosis', () => {
    it('should throw CognitiveDiagnosisUnavailableError without an llmClient', async () => {
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        logger: createMockLogger(),
      })

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
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        llmClient,
        logger: createMockLogger(),
      })

      const result = await service.cognitiveDiagnosis({
        scenarioId: 'audi-a3-idle',
        userQuery: '¿Por qué tiembla el motor al ralentí?',
      })

      expect(result.diagnosis).toBe('El motor tiembla en ralentí por fallo de encendido.')
      expect(result.severity).toBe('high')
      expect(result.confidence).toBe(0.9)
      expect(result.recommendations).toEqual(['Revisar bujías', 'Cambiar bobina'])
      expect(result.toolCalls).toEqual(cognitiveToolCalls)
      expect(llmClient.sendMessage).toHaveBeenCalledTimes(1)
      const input = (llmClient.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(input.tools).toHaveLength(7)
      expect(input.userMessage).toContain('Audi A3')
    })

    it('should throw DiagnosisScenarioNotFoundError for an unknown scenario', async () => {
      const llmClient = mockLlmClient({
        sendMessage: vi
          .fn()
          .mockResolvedValue({ text: cognitiveText, toolCalls: cognitiveToolCalls }),
      })
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        llmClient,
        logger: createMockLogger(),
      })

      await expect(service.cognitiveDiagnosis({ scenarioId: 'no-existe' })).rejects.toThrow(
        DiagnosisScenarioNotFoundError,
      )
      expect(llmClient.sendMessage).not.toHaveBeenCalled()
    })

    it('should pass conversationHistory to the use case', async () => {
      const llmClient = mockLlmClient({
        sendMessage: vi
          .fn()
          .mockResolvedValue({ text: cognitiveText, toolCalls: cognitiveToolCalls }),
      })
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        llmClient,
        logger: createMockLogger(),
      })

      await service.cognitiveDiagnosis({
        scenarioId: 'audi-a3-idle',
        userQuery: '¿Y eso por qué?',
        conversationHistory: [
          { __type: 'user_message', content: '¿Por qué tiembla?' },
          { __type: 'raw_response', data: { text: 'Fallos de cilindro 1' } },
        ],
      })

      const input = (llmClient.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(input.conversationHistory).toEqual([
        { __type: 'user_message', content: '¿Por qué tiembla?' },
        { __type: 'raw_response', data: { text: 'Fallos de cilindro 1' } },
      ])
    })

    it('should propagate knowledgeStack to the cognitive use case', async () => {
      const llmClient = mockLlmClient({
        sendMessage: vi
          .fn()
          .mockResolvedValue({ text: cognitiveText, toolCalls: cognitiveToolCalls }),
      })
      const diagnosisIndex: DiagnosisVectorRepository = {
        search: vi.fn().mockResolvedValue([]),
        index: vi.fn().mockResolvedValue(undefined),
      }
      const pidsIndex = { index: vi.fn(), search: vi.fn() } as unknown as PidVectorRepository
      const dtcsIndex = { index: vi.fn(), search: vi.fn() } as unknown as DtcVectorRepository
      const ecusIndex = { index: vi.fn(), search: vi.fn() } as unknown as EcuVectorRepository
      const knowledgeStack: KnowledgeStack = { pidsIndex, dtcsIndex, diagnosisIndex, ecusIndex }
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        llmClient,
        logger: createMockLogger(),
        knowledgeStack,
      })

      await service.cognitiveDiagnosis({
        scenarioId: 'audi-a3-idle',
        userQuery: '¿Por qué tiembla el motor al ralentí?',
      })

      expect(diagnosisIndex.index).toHaveBeenCalledTimes(1)
    })
  })

  describe('getLiveData', () => {
    it('should use readPids for a custom PID list and map to named fields', async () => {
      const repos = createMockObdRepos()
      const repo = repos.get('audi-a3-idle')!
      vi.mocked(repo.readPids).mockResolvedValue(
        new Map([
          ['0C', 800],
          ['0D', 90],
        ]),
      )
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: repos,
        logger: createMockLogger(),
      })

      const result = await service.getLiveData('audi-a3-idle', ['0C', '0D'])

      expect(result).toEqual({
        rpm: 800,
        speed: 90,
        readings: [
          { code: '01 0C', name: 'Engine RPM', unit: 'rpm', value: 800 },
          { code: '01 0D', name: 'Vehicle Speed', unit: 'km/h', value: 90 },
        ],
      })
      expect(repo.readPids).toHaveBeenCalledWith('01', ['0C', '0D'])
      expect(repo.readPid).not.toHaveBeenCalled()
    })

    it('should default to the 4 dashboard PIDs when no list is provided', async () => {
      const repos = createMockObdRepos()
      const repo = repos.get('audi-a3-idle')!
      vi.mocked(repo.readPids).mockResolvedValue(
        new Map([
          ['0C', 750],
          ['05', 90],
          ['0D', 0],
          ['0F', 25],
        ]),
      )
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: repos,
        logger: createMockLogger(),
      })

      const result = await service.getLiveData('audi-a3-idle')

      expect(result).toEqual({
        rpm: 750,
        coolantTemp: 90,
        speed: 0,
        intakeTemp: 25,
        readings: [
          { code: '01 0C', name: 'Engine RPM', unit: 'rpm', value: 750 },
          { code: '01 05', name: 'Engine Coolant Temperature', unit: '°C', value: 90 },
          { code: '01 0D', name: 'Vehicle Speed', unit: 'km/h', value: 0 },
          { code: '01 0F', name: 'Intake Air Temperature', unit: '°C', value: 25 },
        ],
      })
      expect(repo.readPids).toHaveBeenCalledWith('01', ['0C', '05', '0D', '0F'])
    })

    it('should set null for a requested PID that readPids omits', async () => {
      const repos = createMockObdRepos()
      const repo = repos.get('audi-a3-idle')!
      vi.mocked(repo.readPids).mockResolvedValue(new Map([['0C', 800]]))
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: repos,
        logger: createMockLogger(),
      })

      const result = await service.getLiveData('audi-a3-idle', ['0C', '0D'])

      expect(result).toEqual({
        rpm: 800,
        speed: null,
        readings: [
          { code: '01 0C', name: 'Engine RPM', unit: 'rpm', value: 800 },
          { code: '01 0D', name: 'Vehicle Speed', unit: 'km/h', value: null },
        ],
      })
    })

    it('should return generic readings for PIDs without a dedicated gauge', async () => {
      const repos = createMockObdRepos()
      const repo = repos.get('audi-a3-idle')!
      vi.mocked(repo.readPids).mockResolvedValue(
        new Map([
          ['11', 14],
          ['42', 14.2],
        ]),
      )
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: repos,
        logger: createMockLogger(),
      })

      const result = await service.getLiveData('audi-a3-idle', ['11', '42'])

      expect(result).toEqual({
        readings: [
          { code: '01 11', name: 'Throttle Position', unit: '%', value: 14 },
          { code: '01 42', name: 'Control Module Voltage', unit: 'V', value: 14.2 },
        ],
      })
    })

    it('should return the 4 named fields plus readings of the default PIDs', async () => {
      const repos = createMockObdRepos()
      const repo = repos.get('audi-a3-idle')!
      vi.mocked(repo.readPids).mockResolvedValue(
        new Map([
          ['0C', 750],
          ['05', 90],
          ['0D', 0],
          ['0F', 25],
        ]),
      )
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: repos,
        logger: createMockLogger(),
      })

      const result = await service.getLiveData('audi-a3-idle')

      expect(result).toEqual({
        rpm: 750,
        coolantTemp: 90,
        speed: 0,
        intakeTemp: 25,
        readings: [
          { code: '01 0C', name: 'Engine RPM', unit: 'rpm', value: 750 },
          { code: '01 05', name: 'Engine Coolant Temperature', unit: '°C', value: 90 },
          { code: '01 0D', name: 'Vehicle Speed', unit: 'km/h', value: 0 },
          { code: '01 0F', name: 'Intake Air Temperature', unit: '°C', value: 25 },
        ],
      })
    })

    it('should emit a reading with null value for a PID that readPids omits', async () => {
      const repos = createMockObdRepos()
      const repo = repos.get('audi-a3-idle')!
      vi.mocked(repo.readPids).mockResolvedValue(new Map([['0C', 800]]))
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: repos,
        logger: createMockLogger(),
      })

      const result = await service.getLiveData('audi-a3-idle', ['0C', '0D'])

      expect(result.readings).toEqual([
        { code: '01 0C', name: 'Engine RPM', unit: 'rpm', value: 800 },
        { code: '01 0D', name: 'Vehicle Speed', unit: 'km/h', value: null },
      ])
    })
  })

  describe('listAvailablePids', () => {
    it('returns the 16 Mode 01 PIDs with name and unit, without touching the repository', () => {
      const repos = createMockObdRepos()
      const repo = repos.get('audi-a3-idle')!
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: repos,
        logger: createMockLogger(),
      })

      const pids = service.listAvailablePids()

      expect(pids).toHaveLength(16)
      expect(pids).toContainEqual({ code: '01 0C', name: 'Engine RPM', unit: 'rpm' })
      expect(pids).toContainEqual({ code: '01 05', name: 'Engine Coolant Temperature', unit: '°C' })
      expect(pids).toContainEqual({ code: '01 42', name: 'Control Module Voltage', unit: 'V' })
      expect(repo.readPid).not.toHaveBeenCalled()
      expect(repo.getSupportedPids).not.toHaveBeenCalled()
    })
  })

  describe('getFreezeFrame', () => {
    it('should delegate to the repository getFreezeFrame with the dtc in TCP mode', async () => {
      const frame = new FreezeFrame({ dtcCode: 'P0301', pidValues: { rpm: 750 } })
      const obdRepo = createMockObdRepo()
      vi.mocked(obdRepo.getFreezeFrame).mockResolvedValue(frame)
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        obdRepo,
        logger: createMockLogger(),
      })

      const result = await service.getFreezeFrame(undefined, 'P0301')

      expect(result).toEqual(frame)
      expect(obdRepo.getFreezeFrame).toHaveBeenCalledWith('P0301')
    })

    it('should resolve the scenario repository and delegate in simulation mode', async () => {
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        logger: createMockLogger(),
      })

      const result = await service.getFreezeFrame('audi-a3-idle', 'P0301')

      expect(result).toBeNull()
    })

    it('should throw DiagnosisScenarioNotFoundError for an unknown scenario', async () => {
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        logger: createMockLogger(),
      })

      await expect(service.getFreezeFrame('no-existe', 'P0301')).rejects.toThrow(
        DiagnosisScenarioNotFoundError,
      )
    })
  })

  describe('getEcuInfo', () => {
    it('should return structured EcuInfo[] from a scenario', async () => {
      const ecu = new EcuInfo({
        id: 0,
        vehicleId: 0,
        name: 'Engine Control Unit',
        requestAddr: '7E0',
        responseAddr: '7E8',
        type: 'ECM',
        protocol: 'ISO 15765-4 (CAN 11/500)',
      })
      const service = new DiagnosisService({
        scenarios: [{ ...mockScenarios[0], ecus: [ecu] }],
        obdRepos: new Map([['audi-a3-idle', createMockObdRepo({ ecus: [ecu] })]]),
        logger: createMockLogger(),
      })

      const result = await service.getEcuInfo('audi-a3-idle')

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Engine Control Unit')
      expect(result[0].requestAddr).toBe('7E0')
    })

    it('should return ECUs from obdRepo in TCP mode without scenarioId', async () => {
      const ecu = new EcuInfo({
        id: 0,
        vehicleId: 0,
        name: 'Engine Control Unit',
        requestAddr: '7E0',
        responseAddr: '7E8',
        type: 'ECM',
        protocol: 'ISO 15765-4 (CAN 11/500)',
      })
      const obdRepo = createMockObdRepo()
      vi.mocked(obdRepo.getEcuInfo as ReturnType<typeof vi.fn>).mockResolvedValue([ecu])
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        obdRepo,
        logger: createMockLogger(),
      })

      const result = await service.getEcuInfo()

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Engine Control Unit')
    })

    it('should throw DiagnosisScenarioNotFoundError for unknown scenario', async () => {
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        logger: createMockLogger(),
      })

      await expect(service.getEcuInfo('no-existe')).rejects.toThrow(DiagnosisScenarioNotFoundError)
    })
  })

  describe('getVehicleInfo', () => {
    it('should return the vehicle data of a scenario decorated with the decoded VIN fields', async () => {
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        logger: createMockLogger(),
      })

      const result = await service.getVehicleInfo('audi-a3-idle')

      expect(result).toEqual({
        vin: 'WAUZZZ8V5JA123456',
        make: 'Audi',
        model: 'A3',
        year: 2018,
        engineType: '2.0 TFSI',
        manufacturer: 'Audi',
        region: { country: 'Germany', region: 'Europe' },
        modelYearDecoded: 2018,
        vinStatus: 'read',
      })
    })

    it('should merge descriptor data with VIN from ECU, keeping VIN from ECU always', async () => {
      const repos = createMockObdRepos()
      // Mock the repo to return a different VIN than the descriptor
      vi.mocked(
        repos.get('audi-a3-idle')!.getVehicleInfo as ReturnType<typeof vi.fn>,
      ).mockResolvedValue({
        make: 'unknown',
        model: 'unknown',
        year: 0,
        engineType: 'unknown',
        vin: new Vin('WP0ZZZ99ZTS390000'),
      })

      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: repos,
        logger: createMockLogger(),
      })

      const result = await service.getVehicleInfo('audi-a3-idle')

      // VIN siempre del ECU, metadatos del descriptor
      expect(result.vin).toBe('WP0ZZZ99ZTS390000')
      expect(result.make).toBe('Audi')
      expect(result.model).toBe('A3')
      expect(result.year).toBe(2018)
      expect(result.engineType).toBe('2.0 TFSI')
      // Decodificacion del VIN real (Porsche WMI)
      expect(result.manufacturer).toBe('Porsche')
    })

    it('should return the vehicle data from obdRepo in TCP mode without scenarioId', async () => {
      const obdRepo = createMockObdRepo()
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        obdRepo,
        logger: createMockLogger(),
      })

      const result = await service.getVehicleInfo()

      expect(result.vin).toBe('WAUZZZ8V5JA123456')
      expect(result.manufacturer).toBe('Audi')
      expect(result.vinStatus).toBe('read')
    })

    it('should null the decoded fields for FALLBACK_VIN without throwing', async () => {
      const obdRepo = createMockObdRepo()
      vi.mocked(obdRepo.getVehicleInfo as ReturnType<typeof vi.fn>).mockResolvedValue({
        make: 'unknown',
        model: 'unknown',
        year: 0,
        engineType: 'unknown',
        vin: new Vin(FALLBACK_VIN),
      })
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        obdRepo,
        logger: createMockLogger(),
      })

      const result = await service.getVehicleInfo()

      expect(result).toEqual({
        vin: FALLBACK_VIN,
        make: 'unknown',
        model: 'unknown',
        year: 0,
        engineType: 'unknown',
        manufacturer: null,
        region: null,
        modelYearDecoded: null,
        vinStatus: 'unreadable',
      })
    })

    it('should null the decoded fields when the VIN is not decodable without throwing', async () => {
      const obdRepo = createMockObdRepo()
      vi.mocked(obdRepo.getVehicleInfo as ReturnType<typeof vi.fn>).mockResolvedValue({
        make: 'unknown',
        model: 'unknown',
        year: 0,
        engineType: 'unknown',
        vin: 'NO-ES-UN-VIN',
      })
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        obdRepo,
        logger: createMockLogger(),
      })

      const result = await service.getVehicleInfo()

      expect(result.vin).toBe('NO-ES-UN-VIN')
      expect(result.manufacturer).toBeNull()
      expect(result.region).toBeNull()
      expect(result.modelYearDecoded).toBeNull()
      expect(result.vinStatus).toBe('read')
    })

    it('should throw DiagnosisScenarioNotFoundError for unknown scenario', async () => {
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        logger: createMockLogger(),
      })

      await expect(service.getVehicleInfo('no-existe')).rejects.toThrow(
        DiagnosisScenarioNotFoundError,
      )
    })
  })

  describe('hasCognitiveDiagnosis', () => {
    it('should return true when the service receives an llmClient', () => {
      const llmClient = mockLlmClient()
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        llmClient,
        logger: createMockLogger(),
      })

      expect(service.hasCognitiveDiagnosis).toBe(true)
    })

    it('should return false when llmClient is undefined', () => {
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        logger: createMockLogger(),
      })

      expect(service.hasCognitiveDiagnosis).toBe(false)
    })
  })

  describe('clearDtcCodes', () => {
    it('should delegate to the repository clearDtcCodes in TCP mode', async () => {
      const obdRepo = createMockObdRepo()
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        obdRepo,
        logger: createMockLogger(),
      })

      await service.clearDtcCodes()

      expect(obdRepo.clearDtcCodes).toHaveBeenCalledTimes(1)
    })

    it('should resolve the scenario repository and delegate in simulation mode', async () => {
      const repos = createMockObdRepos()
      const repo = repos.get('audi-a3-idle')!
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: repos,
        logger: createMockLogger(),
      })

      await service.clearDtcCodes('audi-a3-idle')

      expect(repo.clearDtcCodes).toHaveBeenCalledTimes(1)
    })

    it('should throw DiagnosisScenarioNotFoundError for an unknown scenario', async () => {
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        logger: createMockLogger(),
      })

      await expect(service.clearDtcCodes('no-existe')).rejects.toThrow(
        DiagnosisScenarioNotFoundError,
      )
    })
  })

  describe('readPendingDtcCodes', () => {
    it('should delegate to the repository readPendingDtcCodes in TCP mode', async () => {
      const obdRepo = createMockObdRepo()
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        obdRepo,
        logger: createMockLogger(),
      })

      const result = await service.readPendingDtcCodes()

      expect(result).toEqual([{ code: 'P0301', description: 'Cylinder 1 Misfire' }])
      expect(obdRepo.readPendingDtcCodes).toHaveBeenCalledTimes(1)
    })

    it('should resolve the scenario repository and delegate in simulation mode', async () => {
      const repos = createMockObdRepos()
      const repo = repos.get('audi-a3-idle')!
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: repos,
        logger: createMockLogger(),
      })

      const result = await service.readPendingDtcCodes('audi-a3-idle')

      expect(result).toEqual([{ code: 'P0301', description: 'Cylinder 1 Misfire' }])
      expect(repo.readPendingDtcCodes).toHaveBeenCalledTimes(1)
    })

    it('should throw DiagnosisScenarioNotFoundError for an unknown scenario', async () => {
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        logger: createMockLogger(),
      })

      await expect(service.readPendingDtcCodes('no-existe')).rejects.toThrow(
        DiagnosisScenarioNotFoundError,
      )
    })
  })

  describe('readPermanentDtcCodes', () => {
    it('should delegate to the repository readPermanentDtcCodes in TCP mode', async () => {
      const obdRepo = createMockObdRepo()
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        obdRepo,
        logger: createMockLogger(),
      })

      const result = await service.readPermanentDtcCodes()

      expect(result).toEqual([{ code: 'P0401', description: 'EGR Flow Insufficient' }])
      expect(obdRepo.readPermanentDtcCodes).toHaveBeenCalledTimes(1)
    })

    it('should resolve the scenario repository and delegate in simulation mode', async () => {
      const repos = createMockObdRepos()
      const repo = repos.get('audi-a3-idle')!
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: repos,
        logger: createMockLogger(),
      })

      const result = await service.readPermanentDtcCodes('audi-a3-idle')

      expect(result).toEqual([{ code: 'P0401', description: 'EGR Flow Insufficient' }])
      expect(repo.readPermanentDtcCodes).toHaveBeenCalledTimes(1)
    })

    it('should throw DiagnosisScenarioNotFoundError for an unknown scenario', async () => {
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        logger: createMockLogger(),
      })

      await expect(service.readPermanentDtcCodes('no-existe')).rejects.toThrow(
        DiagnosisScenarioNotFoundError,
      )
    })
  })

  describe('callMcpTool', () => {
    it('should call the MCP tool and return its text result', async () => {
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        logger: createMockLogger(),
      })

      const result = await service.callMcpTool('read_pid', 'audi-a3-idle', {
        mode: '01',
        pid: '0C',
      })

      expect(result).toBe('750')
    })

    it('should throw when the tool does not exist', async () => {
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        logger: createMockLogger(),
      })

      await expect(service.callMcpTool('bogus_tool', 'audi-a3-idle')).rejects.toThrow(
        'Tool not found: bogus_tool',
      )
    })

    it('should call a knowledge MCP tool when knowledgeStack is present', async () => {
      const diagnosisIndex: DiagnosisVectorRepository = {
        search: vi.fn().mockResolvedValue([]),
        index: vi.fn().mockResolvedValue(undefined),
      }
      const pidsIndex: PidVectorRepository = {
        index: vi.fn(),
        search: vi.fn().mockResolvedValue([]),
      } as unknown as PidVectorRepository
      const dtcsIndex = { index: vi.fn(), search: vi.fn() } as unknown as DtcVectorRepository
      const ecusIndex = { index: vi.fn(), search: vi.fn() } as unknown as EcuVectorRepository
      const knowledgeStack: KnowledgeStack = { pidsIndex, dtcsIndex, diagnosisIndex, ecusIndex }
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        logger: createMockLogger(),
        knowledgeStack,
      })

      const result = await service.callMcpTool('search_similar_pids', 'audi-a3-idle', {
        query: 'battery',
      })

      expect(pidsIndex.search).toHaveBeenCalledWith('battery', expect.anything())
      expect(result).toContain('No PIDs')
    })
  })

  describe('getVehicleStatus', () => {
    it('should delegate to the repository getVehicleStatus in simulation mode', async () => {
      const repos = createMockObdRepos()
      const repo = repos.get('audi-a3-idle')!
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: repos,
        logger: createMockLogger(),
      })

      const result = await service.getVehicleStatus('audi-a3-idle')

      expect(result).toBeInstanceOf(VehicleStatus)
      expect(repo.getVehicleStatus).toHaveBeenCalledTimes(1)
    })

    it('should delegate to obdRepo in TCP mode without scenarioId', async () => {
      const obdRepo = createMockObdRepo()
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        obdRepo,
        logger: createMockLogger(),
      })

      const result = await service.getVehicleStatus()

      expect(result).toBeInstanceOf(VehicleStatus)
      expect(obdRepo.getVehicleStatus).toHaveBeenCalledTimes(1)
    })

    it('should throw DiagnosisScenarioNotFoundError for an unknown scenario', async () => {
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        logger: createMockLogger(),
      })

      await expect(service.getVehicleStatus('no-existe')).rejects.toThrow(
        DiagnosisScenarioNotFoundError,
      )
    })
  })

  describe('cognitive diagnosis — persistence wiring', () => {
    /** Vin de prueba usado en el mock de getVehicleInfo. */
    const TEST_VIN = new Vin('WAUZZZ8V5JA123456')

    /** Helper: configura servicio con llmClient exitoso + vehicleRepo. */
    function createService(vehicleRepo?: VehicleRepository, llmOverrides?: Partial<LlmClientPort>) {
      const llmClient = mockLlmClient({
        sendMessage: vi
          .fn()
          .mockResolvedValue({ text: cognitiveText, toolCalls: cognitiveToolCalls }),
        ...llmOverrides,
      })
      return new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        llmClient,
        logger: createMockLogger(),
        vehicleRepo,
      })
    }

    it('upserts vehicle with correct profile converted from VehicleInfo', async () => {
      const upsertedProfile = new VehicleProfile({
        id: 42,
        make: 'Audi',
        model: 'A3',
        year: 2018,
        engineType: 'unknown',
        vin: TEST_VIN,
      })
      const vehicleRepo = createMockVehicleRepo({
        upsertVehicle: vi.fn().mockResolvedValue(upsertedProfile),
        createSession: vi.fn().mockResolvedValue(
          new DiagnosisSession({
            id: 10,
            vehicleId: 42,
            scenarioId: 'audi-a3-idle',
            startedAt: new Date().toISOString(),
          }),
        ),
      })

      await createService(vehicleRepo).cognitiveDiagnosis({
        scenarioId: 'audi-a3-idle',
        userQuery: '¿Por qué tiembla?',
      })

      expect(vehicleRepo.upsertVehicle).toHaveBeenCalledTimes(1)
      const profileArg = (vehicleRepo.upsertVehicle as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as VehicleProfile
      expect(profileArg).toBeInstanceOf(VehicleProfile)
      expect(profileArg.id).toBe(0)
      expect(profileArg.make).toBe('Audi')
      expect(profileArg.model).toBe('A3')
      expect(profileArg.year).toBe(2018)
      expect(profileArg.engineType).toBe('unknown')
      expect(profileArg.vin).toBeInstanceOf(Vin)
      expect(profileArg.vin.value).toBe('WAUZZZ8V5JA123456')
    })

    it('does not call upsert when vehicleRepo is absent', async () => {
      // No vehicleRepo passed — diagnosis debe completarse sin error
      const result = await createService(undefined).cognitiveDiagnosis({
        scenarioId: 'audi-a3-idle',
        userQuery: '¿Por qué tiembla?',
      })

      expect(result.diagnosis).toContain('El motor tiembla')
      expect(result.severity).toBe('high')
    })

    it('degrades gracefully when upsertVehicle fails', async () => {
      const logger = createMockLogger()
      const vehicleRepo = createMockVehicleRepo({
        upsertVehicle: vi.fn().mockRejectedValue(new Error('DB connection lost')),
      })
      const llmClient = mockLlmClient({
        sendMessage: vi
          .fn()
          .mockResolvedValue({ text: cognitiveText, toolCalls: cognitiveToolCalls }),
      })
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        llmClient,
        logger,
        vehicleRepo,
      })

      const result = await service.cognitiveDiagnosis({
        scenarioId: 'audi-a3-idle',
        userQuery: '¿Por qué tiembla?',
      })

      // El diagnóstico debe completarse sin propagar el error del upsert
      expect(result.diagnosis).toContain('El motor tiembla')
      expect(vehicleRepo.upsertVehicle).toHaveBeenCalledTimes(1)
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to upsert vehicle in diagnosis session',
        expect.objectContaining({ err: expect.any(Error) }),
      )
    })

    it('creates session after upsert success', async () => {
      const upsertedProfile = new VehicleProfile({
        id: 42,
        make: 'Audi',
        model: 'A3',
        year: 2018,
        engineType: 'unknown',
        vin: TEST_VIN,
      })
      const vehicleRepo = createMockVehicleRepo({
        upsertVehicle: vi.fn().mockResolvedValue(upsertedProfile),
        createSession: vi.fn().mockResolvedValue(
          new DiagnosisSession({
            id: 10,
            vehicleId: 42,
            scenarioId: 'audi-a3-idle',
            startedAt: new Date().toISOString(),
          }),
        ),
      })

      await createService(vehicleRepo).cognitiveDiagnosis({
        scenarioId: 'audi-a3-idle',
        userQuery: '¿Por qué tiembla?',
      })

      expect(vehicleRepo.createSession).toHaveBeenCalledTimes(1)
      const sessionArg = (vehicleRepo.createSession as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as DiagnosisSession
      expect(sessionArg).toBeInstanceOf(DiagnosisSession)
      expect(sessionArg.vehicleId).toBe(42)
      expect(sessionArg.scenarioId).toBe('audi-a3-idle')
      expect(sessionArg.startedAt).toBeDefined()
    })

    it('persists the first assistant turn in the snapshot conversation', async () => {
      const upsertedProfile = new VehicleProfile({
        id: 42,
        make: 'Audi',
        model: 'A3',
        year: 2018,
        engineType: 'unknown',
        vin: TEST_VIN,
      })
      const endSessionSpy = vi.fn().mockResolvedValue(undefined)
      const vehicleRepo = createMockVehicleRepo({
        upsertVehicle: vi.fn().mockResolvedValue(upsertedProfile),
        createSession: vi.fn().mockResolvedValue(
          new DiagnosisSession({
            id: 10,
            vehicleId: 42,
            scenarioId: 'audi-a3-idle',
            startedAt: new Date().toISOString(),
          }),
        ),
        endSession: endSessionSpy,
      })

      await createService(vehicleRepo).cognitiveDiagnosis({
        scenarioId: 'audi-a3-idle',
        userQuery: '¿Por qué tiembla?',
      })

      expect(endSessionSpy).toHaveBeenCalledTimes(1)
      const snapshot = endSessionSpy.mock.calls[0][1] as {
        resultJson: string
        severity: string
        dtcCount: number
      }
      expect(snapshot).toBeDefined()
      const parsed = JSON.parse(snapshot.resultJson) as {
        conversation: Array<{ role: string; text: string; timestamp: string }>
      }
      expect(parsed.conversation).toEqual([
        {
          role: 'assistant',
          text: 'El motor tiembla en ralentí por fallo de encendido.',
          timestamp: expect.any(String),
        },
      ])
    })

    it('returns the created sessionId in the cognitive result', async () => {
      const upsertedProfile = new VehicleProfile({
        id: 42,
        make: 'Audi',
        model: 'A3',
        year: 2018,
        engineType: 'unknown',
        vin: TEST_VIN,
      })
      const vehicleRepo = createMockVehicleRepo({
        upsertVehicle: vi.fn().mockResolvedValue(upsertedProfile),
        createSession: vi.fn().mockResolvedValue(
          new DiagnosisSession({
            id: 10,
            vehicleId: 42,
            scenarioId: 'audi-a3-idle',
            startedAt: new Date().toISOString(),
          }),
        ),
      })

      const result = await createService(vehicleRepo).cognitiveDiagnosis({
        scenarioId: 'audi-a3-idle',
        userQuery: '¿Por qué tiembla?',
      })

      expect(result.sessionId).toBe(10)
    })

    it('reuses the existing session and appends the follow-up turns without creating a new session', async () => {
      const existingSession = new DiagnosisSession({
        id: 10,
        vehicleId: 42,
        userId: 7,
        scenarioId: 'audi-a3-idle',
        startedAt: '2026-08-12T10:00:00.000Z',
        endedAt: '2026-08-12T10:01:00.000Z',
        resultJson: JSON.stringify({
          vehicle: { vin: 'WAUZZZ8V5JA123456', make: 'Audi', model: 'A3', year: 2018 },
          diagnosis: { severity: 'high', confidence: 0.9, narrative: 'primero' },
          conversation: [{ role: 'assistant', text: 'primero', timestamp: 't1' }],
          timestamp: 't1',
        }),
      })
      const updateSessionResultSpy = vi.fn().mockResolvedValue(undefined)
      const vehicleRepo = createMockVehicleRepo({
        findSessionById: vi.fn().mockResolvedValue(existingSession),
        updateSessionResult: updateSessionResultSpy,
      })

      const result = await createService(vehicleRepo).cognitiveDiagnosis({
        scenarioId: 'audi-a3-idle',
        userQuery: '¿Y en frío?',
        userId: 7,
        sessionId: 10,
      })

      expect(result.sessionId).toBe(10)
      expect(vehicleRepo.upsertVehicle).not.toHaveBeenCalled()
      expect(vehicleRepo.createSession).not.toHaveBeenCalled()
      expect(updateSessionResultSpy).toHaveBeenCalledTimes(1)
      const [sid, snapshot] = updateSessionResultSpy.mock.calls[0] as [
        number,
        { resultJson: string; severity: string; dtcCount: number },
      ]
      expect(sid).toBe(10)
      const parsed = JSON.parse(snapshot.resultJson) as {
        conversation: Array<{ role: string; text: string; timestamp: string }>
      }
      expect(parsed.conversation).toHaveLength(3)
      expect(parsed.conversation[0]).toEqual({
        role: 'assistant',
        text: 'primero',
        timestamp: 't1',
      })
      expect(parsed.conversation[1]).toMatchObject({ role: 'user', text: '¿Y en frío?' })
      expect(parsed.conversation[2]).toMatchObject({
        role: 'assistant',
        text: 'El motor tiembla en ralentí por fallo de encendido.',
      })
    })

    it('throws DiagnosisSessionNotFoundError for another user sessionId without mutating', async () => {
      const sendSpy = vi
        .fn()
        .mockResolvedValue({ text: cognitiveText, toolCalls: cognitiveToolCalls })
      const vehicleRepo = createMockVehicleRepo({
        findSessionById: vi.fn().mockResolvedValue(null),
      })

      await expect(
        createService(vehicleRepo, { sendMessage: sendSpy }).cognitiveDiagnosis({
          scenarioId: 'audi-a3-idle',
          userQuery: 'x',
          userId: 7,
          sessionId: 999,
        }),
      ).rejects.toThrow(DiagnosisSessionNotFoundError)

      expect(sendSpy).not.toHaveBeenCalled()
      expect(vehicleRepo.createSession).not.toHaveBeenCalled()
      expect(vehicleRepo.updateSessionResult).not.toHaveBeenCalled()
      expect(vehicleRepo.endSession).not.toHaveBeenCalled()
    })

    it('calls endSession in finally even on cognitiveDiagnosis error', async () => {
      const upsertedProfile = new VehicleProfile({
        id: 42,
        make: 'Audi',
        model: 'A3',
        year: 2018,
        engineType: 'unknown',
        vin: TEST_VIN,
      })
      const endSessionSpy = vi.fn().mockResolvedValue(undefined)
      const vehicleRepo = createMockVehicleRepo({
        upsertVehicle: vi.fn().mockResolvedValue(upsertedProfile),
        createSession: vi.fn().mockResolvedValue(
          new DiagnosisSession({
            id: 10,
            vehicleId: 42,
            scenarioId: 'audi-a3-idle',
            startedAt: new Date().toISOString(),
          }),
        ),
        endSession: endSessionSpy,
      })
      const logger = createMockLogger()

      const llmClient = mockLlmClient({
        sendMessage: vi.fn().mockRejectedValue(new Error('LLM API failure')),
      })
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        llmClient,
        logger,
        vehicleRepo,
      })

      await expect(
        service.cognitiveDiagnosis({
          scenarioId: 'audi-a3-idle',
          userQuery: '¿Por qué tiembla?',
        }),
      ).rejects.toThrow('LLM API failure')

      expect(endSessionSpy).toHaveBeenCalledTimes(1)
      expect(endSessionSpy).toHaveBeenCalledWith(10, undefined)
    })

    it('does not call endSession if createSession failed', async () => {
      const upsertedProfile = new VehicleProfile({
        id: 42,
        make: 'Audi',
        model: 'A3',
        year: 2018,
        engineType: 'unknown',
        vin: TEST_VIN,
      })
      const endSessionSpy = vi.fn().mockResolvedValue(undefined)
      const vehicleRepo = createMockVehicleRepo({
        upsertVehicle: vi.fn().mockResolvedValue(upsertedProfile),
        createSession: vi.fn().mockRejectedValue(new Error('DB write failed')),
        endSession: endSessionSpy,
      })
      const logger = createMockLogger()

      const llmClient = mockLlmClient({
        sendMessage: vi
          .fn()
          .mockResolvedValue({ text: cognitiveText, toolCalls: cognitiveToolCalls }),
      })
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        llmClient,
        logger,
        vehicleRepo,
      })

      const result = await service.cognitiveDiagnosis({
        scenarioId: 'audi-a3-idle',
        userQuery: '¿Por qué tiembla?',
      })

      expect(result.diagnosis).toContain('El motor tiembla')
      expect(endSessionSpy).not.toHaveBeenCalled()
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to create diagnosis session',
        expect.objectContaining({ err: expect.any(Error) }),
      )
    })

    it('enriches sessionContext with normalized manufacturer and model', async () => {
      const upsertedProfile = new VehicleProfile({
        id: 42,
        make: 'Audi',
        model: 'A3',
        year: 2018,
        engineType: 'unknown',
        vin: TEST_VIN,
      })
      const vehicleRepo = createMockVehicleRepo({
        upsertVehicle: vi.fn().mockResolvedValue(upsertedProfile),
        createSession: vi.fn().mockResolvedValue(
          new DiagnosisSession({
            id: 10,
            vehicleId: 42,
            scenarioId: 'audi-a3-idle',
            startedAt: new Date().toISOString(),
          }),
        ),
      })

      // LLM mock that invokes read_pid with mode 22 to trigger autoRegisterPid
      const llmClient = mockLlmClient({
        sendMessage: vi.fn().mockImplementation(async (_input, handler) => {
          await handler('read_pid', { mode: '22', pid: '0300' })
          return {
            text: cognitiveText,
            toolCalls: [{ tool: 'read_pid', args: { mode: '22', pid: '0300' }, result: '750' }],
          }
        }),
      })

      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        llmClient,
        logger: createMockLogger(),
        vehicleRepo,
      })

      await service.cognitiveDiagnosis({
        scenarioId: 'audi-a3-idle',
        userQuery: 'test',
      })

      // Flush fire-and-forget microtasks from autoRegisterPid
      await new Promise((resolve) => setTimeout(resolve, 10))

      // Verify that findPidDefinition was called with manufacturer/model from sessionContext
      expect(vehicleRepo.findPidDefinition).toHaveBeenCalledWith('22', '0300', 'Audi', 'A3')
      expect(vehicleRepo.insertPidDefinition).toHaveBeenCalledTimes(1)
      const inserted = (vehicleRepo.insertPidDefinition as ReturnType<typeof vi.fn>).mock
        .calls[0][0]
      expect(inserted.manufacturer).toBe('Audi')
      expect(inserted.model).toBe('A3')
    })

    it('normalizes manufacturer in sessionContext (e.g., "audi ag" → "Audi")', async () => {
      const upsertedProfile = new VehicleProfile({
        id: 42,
        make: 'Audi',
        model: 'A3',
        year: 2018,
        engineType: 'unknown',
        vin: TEST_VIN,
      })
      const vehicleRepo = createMockVehicleRepo({
        upsertVehicle: vi.fn().mockResolvedValue(upsertedProfile),
        createSession: vi.fn().mockResolvedValue(
          new DiagnosisSession({
            id: 10,
            vehicleId: 42,
            scenarioId: 'audi-a3-idle',
            startedAt: new Date().toISOString(),
          }),
        ),
      })

      // Override the obd repo for audi-a3-idle to return "Audi AG" as make
      const repos = createMockObdRepos()
      vi.mocked(
        repos.get('audi-a3-idle')!.getVehicleInfo as ReturnType<typeof vi.fn>,
      ).mockResolvedValue({
        make: 'Audi AG',
        model: 'A3',
        year: 2018,
        engineType: 'unknown',
        vin: TEST_VIN,
      })

      const llmClient = mockLlmClient({
        sendMessage: vi.fn().mockImplementation(async (_input, handler) => {
          await handler('read_pid', { mode: '22', pid: '0300' })
          return {
            text: cognitiveText,
            toolCalls: [{ tool: 'read_pid', args: { mode: '22', pid: '0300' }, result: '750' }],
          }
        }),
      })

      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: repos,
        llmClient,
        logger: createMockLogger(),
        vehicleRepo,
      })

      await service.cognitiveDiagnosis({
        scenarioId: 'audi-a3-idle',
        userQuery: 'test',
      })

      // Flush fire-and-forget microtasks
      await new Promise((resolve) => setTimeout(resolve, 10))

      // Verify that the normalized manufacturer "Audi" was passed (not "Audi AG")
      expect(vehicleRepo.findPidDefinition).toHaveBeenCalledWith('22', '0300', 'Audi', 'A3')
    })

    it('triggers persistPidReading via MCP tool calls when sessionContext is active', async () => {
      const upsertedProfile = new VehicleProfile({
        id: 42,
        make: 'Audi',
        model: 'A3',
        year: 2018,
        engineType: 'unknown',
        vin: TEST_VIN,
      })
      const vehicleRepo = createMockVehicleRepo({
        upsertVehicle: vi.fn().mockResolvedValue(upsertedProfile),
        createSession: vi.fn().mockResolvedValue(
          new DiagnosisSession({
            id: 10,
            vehicleId: 42,
            scenarioId: 'audi-a3-idle',
            startedAt: new Date().toISOString(),
          }),
        ),
      })

      // LLM mock that actually invokes the tool call handler
      const llmClient = mockLlmClient({
        sendMessage: vi.fn().mockImplementation(async (_input, handler) => {
          // Simulate the LLM making tool calls — invoke the handler for each
          for (const tc of cognitiveToolCalls) {
            await handler(tc.tool, tc.args)
          }
          return { text: cognitiveText, toolCalls: cognitiveToolCalls }
        }),
      })

      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        llmClient,
        logger: createMockLogger(),
        vehicleRepo,
      })

      await service.cognitiveDiagnosis({
        scenarioId: 'audi-a3-idle',
        userQuery: 'test',
      })

      // Flush fire-and-forget microtasks from persistPidReading
      await new Promise((resolve) => setTimeout(resolve, 10))

      // Verify that the MCP's read_pid tool triggered persistence via sessionContext
      expect(vehicleRepo.insertPidReading).toHaveBeenCalled()
    })

    it('does not mask original exception when endSession fails in finally', async () => {
      const upsertedProfile = new VehicleProfile({
        id: 42,
        make: 'Audi',
        model: 'A3',
        year: 2018,
        engineType: 'unknown',
        vin: TEST_VIN,
      })
      const endSessionSpy = vi.fn().mockRejectedValue(new Error('endSession failed'))
      const vehicleRepo = createMockVehicleRepo({
        upsertVehicle: vi.fn().mockResolvedValue(upsertedProfile),
        createSession: vi.fn().mockResolvedValue(
          new DiagnosisSession({
            id: 10,
            vehicleId: 42,
            scenarioId: 'audi-a3-idle',
            startedAt: new Date().toISOString(),
          }),
        ),
        endSession: endSessionSpy,
      })
      const logger = createMockLogger()

      const originalError = new Error('Original diagnosis error')
      const llmClient = mockLlmClient({
        sendMessage: vi.fn().mockRejectedValue(originalError),
      })
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        llmClient,
        logger,
        vehicleRepo,
      })

      // La excepción original debe propagarse, no la de endSession
      await expect(
        service.cognitiveDiagnosis({
          scenarioId: 'audi-a3-idle',
          userQuery: '¿Por qué tiembla?',
        }),
      ).rejects.toThrow('Original diagnosis error')

      expect(endSessionSpy).toHaveBeenCalledTimes(1)
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to end diagnosis session with snapshot',
        expect.any(Error),
      )
    })
  })
})
