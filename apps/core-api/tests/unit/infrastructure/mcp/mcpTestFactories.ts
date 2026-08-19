import { vi } from 'vitest'
import type { ObdRepository } from '@/application/ports/ObdRepository.js'
import type { VehicleRepository } from '@/application/ports/VehicleRepository.js'
import type { PidDefinition } from '@/domain/entities/PidDefinition.js'
import { FreezeFrame } from '@/domain/value-objects/FreezeFrame.js'
import { PidCode } from '@/domain/value-objects/PidCode.js'
import { Vin } from '@/domain/value-objects/Vin.js'

/** Bytes por defecto de una lectura simulada (0x0BB8 = 750 tras la formula de RPM). */
const DEFAULT_RAW_BYTES = [0x0b, 0xb8]

export function mockObdRepo(overrides: Partial<ObdRepository> = {}): ObdRepository {
  const repo: ObdRepository = {
    readPid: vi.fn().mockResolvedValue(750),
    readPidRaw: vi.fn().mockResolvedValue([0x0b, 0xb8]),
    getSupportedPids: vi.fn().mockResolvedValue(['01 0C']),
    getFreezeFrame: vi.fn().mockResolvedValue(null),
    readDtcCodes: vi.fn().mockResolvedValue([{ code: 'P0301', description: 'Cylinder 1 Misfire' }]),
    clearDtcCodes: vi.fn().mockResolvedValue(undefined),
    readPendingDtcCodes: vi
      .fn()
      .mockResolvedValue([{ code: 'P0301', description: 'Cylinder 1 Misfire' }]),
    readPermanentDtcCodes: vi
      .fn()
      .mockResolvedValue([{ code: 'P0401', description: 'EGR Flow Insufficient' }]),
    readVin: vi.fn().mockResolvedValue('WAUZZZ8V5JA123456'),
    getVehicleInfo: vi.fn().mockResolvedValue({
      make: 'Audi',
      model: 'A3',
      year: 2018,
      engineType: '2.0 TFSI',
      vin: new Vin('WAUZZZ8V5JA123456'),
    }),
    setPower: vi.fn().mockResolvedValue(undefined),
    getEcuInfo: vi.fn().mockResolvedValue([]),
    readPidWithBytes: vi.fn(),
    ...overrides,
  }

  // `readPidWithBytes` delega en el `readPid` del doble (sobrescrito o no): los
  // tests que fijan `readPid` siguen controlando lo que la tool acaba viendo.
  return {
    ...repo,
    readPidWithBytes:
      overrides.readPidWithBytes ??
      vi.fn(async (mode: string, pid: string) => ({
        value: await repo.readPid(mode, pid),
        bytes: DEFAULT_RAW_BYTES,
      })),
  }
}

export function mockVehicleRepo(overrides: Partial<VehicleRepository> = {}): VehicleRepository {
  return {
    upsertVehicle: vi.fn(),
    findVehicleByVin: vi.fn(),
    insertEcu: vi.fn(),
    findEcusByVehicle: vi.fn(),
    insertPidDefinition: vi.fn(),
    findPidDefinition: vi.fn(),
    findPidsByManufacturerModel: vi.fn().mockResolvedValue([]),
    findPidsByMode: vi.fn().mockResolvedValue([]),
    insertPidReading: vi.fn(),
    createSession: vi.fn(),
    endSession: vi.fn(),
    findDtcDefinition: vi.fn().mockResolvedValue(null),
    upsertDtcDefinition: vi.fn(),
    findDtcDefinitionByCode: vi.fn().mockResolvedValue(null),
    findEcuByAddress: vi.fn().mockResolvedValue(null),
    updateEcuDiscoveredAt: vi.fn(),
    findEcuDefinitionByAddress: vi.fn().mockResolvedValue(null),
    upsertEcuDefinition: vi.fn(),
    ...overrides,
  }
}

export const sampleFreezeFrame: FreezeFrame = new FreezeFrame({
  dtcCode: 'P0301',
  pidValues: { rpm: 3200, coolantTemp: 88, speed: 80 },
})

export const samplePids: PidDefinition[] = [
  {
    id: 1,
    pidCode: new PidCode('01', '0C'),
    name: 'Engine RPM',
    formula: '(A*256+B)/4',
    unit: 'rpm',
    dataBytes: 2,
    pidType: 'formula',
    confidence: 1.0,
    source: 'manual',
  },
  {
    id: 2,
    pidCode: new PidCode('22', '0300'),
    name: 'TCU Odometer',
    formula: '(A<<24|B<<16|C<<8|D)/10',
    unit: 'km',
    dataBytes: 4,
    pidType: 'formula',
    confidence: 0.9,
    source: 'manual',
  },
]

export const sampleMode22Pids: PidDefinition[] = [
  {
    id: 3,
    pidCode: new PidCode('22', '0300'),
    name: 'TCU Odometer',
    formula: '(A<<24|B<<16|C<<8|D)/10',
    unit: 'km',
    dataBytes: 4,
    pidType: 'formula',
    confidence: 0.9,
    source: 'seed',
    manufacturer: 'Toyota',
    model: 'Auris Hybrid',
  },
  {
    id: 4,
    pidCode: new PidCode('22', '0400'),
    name: 'ECM Odometer',
    formula: '(A<<24|B<<16|C<<8|D)/10',
    unit: 'km',
    dataBytes: 4,
    pidType: 'formula',
    confidence: 0.9,
    source: 'seed',
    manufacturer: 'Toyota',
    model: 'Auris Hybrid',
  },
]
