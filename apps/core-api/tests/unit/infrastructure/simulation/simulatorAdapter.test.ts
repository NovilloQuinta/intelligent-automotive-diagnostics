import { describe, it, expect, vi } from 'vitest'
import { ObdSimulatorRepository } from '@/infrastructure/simulation/simulatorAdapter.js'
import { EcuInfo } from '@/domain/entities/ecuInfo.js'
import { ObdSimulator } from '@/infrastructure/simulation/simulator.js'
import { seedScenarios } from '@/infrastructure/simulation/seedScenarios.js'
import { PidRawReadNotSupportedError } from '@/application/obd/obdErrors.js'
import { VehicleStatus } from '@/domain/value-objects/vehicleStatus.js'

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
    getVehicleStatus: vi.fn().mockReturnValue(VehicleStatus.clean('spark')),
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

  describe('readPidRaw', () => {
    /** Simulador real sobre un escenario real: los bytes deben cuadrar con sus sensores. */
    function realRepo(): ObdSimulatorRepository {
      const scenario = seedScenarios.find((s) => s.id === 'audi-a3-idle')
      if (!scenario) throw new Error('escenario audi-a3-idle no encontrado')
      return new ObdSimulatorRepository(new ObdSimulator(scenario))
    }

    it('codifica el RPM del escenario en los dos bytes de SAE J1979', async () => {
      // audi-a3-idle: 750 rpm → 750 * 4 = 3000 → [0x0B, 0xB8]
      const bytes = await realRepo().readPidRaw('01', '0C', 2)

      expect(bytes).toEqual([0x0b, 0xb8])
      expect((bytes[0] * 256 + bytes[1]) / 4).toBe(750)
    })

    it('codifica la temperatura de refrigerante con el offset de 40 grados', async () => {
      // audi-a3-idle: 90 °C → 90 + 40 = 130
      const bytes = await realRepo().readPidRaw('01', '05', 1)

      expect(bytes).toEqual([130])
    })

    it('lanza PidRawReadNotSupportedError con un PID que el escenario no modela', async () => {
      await expect(realRepo().readPidRaw('22', 'F40C', 2)).rejects.toThrow(
        PidRawReadNotSupportedError,
      )
    })

    it('lanza PidRawReadNotSupportedError con un PID Mode 01 fuera de los cuatro sensores', async () => {
      await expect(realRepo().readPidRaw('01', '11', 1)).rejects.toThrow(
        PidRawReadNotSupportedError,
      )
    })
  })

  describe('getVehicleStatus', () => {
    it('should delegate to simulator.getVehicleStatus', async () => {
      const status = VehicleStatus.clean('spark')
      const simulator = mockSimulator({ getVehicleStatus: vi.fn().mockReturnValue(status) })
      const repo = new ObdSimulatorRepository(simulator)

      const result = await repo.getVehicleStatus()

      expect(simulator.getVehicleStatus).toHaveBeenCalledOnce()
      expect(result).toBe(status)
    })
  })
})
