import { describe, it, expect, vi } from 'vitest'
import { ObdSimulatorRepository } from '@/infrastructure/simulation/simulatorAdapter.js'
import { EcuInfo } from '@/domain/entities/ecuInfo.js'
import type { ObdSimulator } from '@/infrastructure/simulation/simulator.js'

function mockSimulator(overrides: Partial<ObdSimulator> = {}): ObdSimulator {
  return {
    readPidValue: vi.fn(),
    getSupportedPids: vi.fn().mockResolvedValue([]),
    getFreezeFrame: vi.fn().mockResolvedValue(null),
    getRawDtcs: vi.fn().mockReturnValue([]),
    getVin: vi.fn().mockReturnValue('WAUZZZ8V5JA123456'),
    getVehicleInfo: vi.fn().mockReturnValue({
      make: 'Audi',
      model: 'A3',
      year: 2018,
      engineType: '2.0 TFSI',
      vin: { value: 'WAUZZZ8V5JA123456' },
    }),
    getEcus: vi.fn().mockReturnValue([]),
    setScenario: vi.fn(),
    ...overrides,
  } as unknown as ObdSimulator
}

describe('ObdSimulatorRepository', () => {
  it('getEcuInfo should delegate to simulator.getEcus', async () => {
    const ecu = new EcuInfo({
      id: 0,
      vehicleId: 0,
      name: 'Engine Control Unit',
      requestAddr: '7E0',
      responseAddr: '7E8',
      type: 'ECM',
      protocol: 'ISO 15765-4 (CAN 11/500)',
    })
    const simulator = mockSimulator({ getEcus: vi.fn().mockReturnValue([ecu]) })
    const repo = new ObdSimulatorRepository(simulator)

    const result = await repo.getEcuInfo()

    expect(result).toEqual([ecu])
    expect(simulator.getEcus).toHaveBeenCalledOnce()
  })

  it('getEcuInfo should return empty array when simulator has no ECUs', async () => {
    const simulator = mockSimulator()
    const repo = new ObdSimulatorRepository(simulator)

    const result = await repo.getEcuInfo()

    expect(result).toEqual([])
  })
})
