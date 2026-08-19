import { vi } from 'vitest'
import { EcuInfo } from '@/domain/entities/EcuInfo.js'
import { Vin } from '@/domain/value-objects/Vin.js'
import { VehicleStatus } from '@/domain/value-objects/VehicleStatus.js'
import { VehicleType, type SimulationScenario } from '@/infrastructure/simulation/scenario.js'
import type { ObdRepository } from '@/application/ports/ObdRepository.js'
import type { LlmClientPort, ToolCallTrace } from '@/application/ports/LlmClientPort.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import type { VehicleRepository } from '@/application/ports/VehicleRepository.js'

export const mockScenarios: SimulationScenario[] = [
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
export function createMockLogger(): LoggerPort {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}

/** Repositorio OBD mockeado (modo TCP): RPM 800, coolant 90, DTC P0301. */
export function createMockObdRepo(sensorOverrides?: {
  rpm?: number
  coolantTemp?: number
  ecus?: EcuInfo[]
}): ObdRepository {
  const readPid = vi.fn(async (_mode: string, pid: string) => {
    if (pid === '0C') return sensorOverrides?.rpm ?? 800
    if (pid === '05') return sensorOverrides?.coolantTemp ?? 90
    return 90
  })
  return {
    readPid,
    readPidWithBytes: vi.fn(async (mode: string, pid: string) => ({
      value: await readPid(mode, pid),
      bytes: [0x00, 0x00],
    })),
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
export function createMockObdRepos(): Map<string, ObdRepository> {
  return new Map([
    ['audi-a3-idle', createMockObdRepo({ rpm: 750, coolantTemp: 90 })],
    ['kawa-z900', createMockObdRepo({ rpm: 4500, coolantTemp: 105 })],
  ])
}

/** Cliente LLM mockeado con sendMessage controlable. */
export function mockLlmClient(overrides: Partial<LlmClientPort> = {}): LlmClientPort {
  return {
    sendMessage: vi.fn(),
    ...overrides,
  }
}

/** Repositorio de vehículos mockeado con todos los métodos requeridos por la interfaz. */
export function createMockVehicleRepo(overrides?: Partial<VehicleRepository>): VehicleRepository {
  return {
    upsertVehicle: vi.fn(),
    findVehicleByVin: vi.fn().mockResolvedValue(null),
    insertEcu: vi.fn(),
    findEcusByVehicle: vi.fn().mockResolvedValue([]),
    insertPidDefinition: vi.fn(),
    findPidDefinition: vi.fn().mockResolvedValue(null),
    findPidsByManufacturerModel: vi.fn().mockResolvedValue([]),
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
    findEcuDefinitionByAddress: vi.fn().mockResolvedValue(null),
    upsertEcuDefinition: vi.fn(),
    findVehicleIdentityByWmi: vi.fn().mockResolvedValue(null),
    upsertVehicleIdentity: vi.fn(),
    ...overrides,
  }
}

export const cognitiveText =
  'El motor tiembla en ralentí por fallo de encendido. ---JSON---{"severity":"high","confidence":0.9,"recommendations":["Revisar bujías","Cambiar bobina"]}---'
export const cognitiveToolCalls: ToolCallTrace[] = [
  { tool: 'read_pid', args: { mode: '01', pid: '0C' }, result: '750' },
  { tool: 'get_dtc_codes', args: {}, result: 'P0301: Cylinder 1 Misfire' },
]
