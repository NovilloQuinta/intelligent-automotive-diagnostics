import { describe, it, expect, vi } from 'vitest'
import { ProcessVehicleDiagnosisUseCase } from '@/application/use-cases/ProcessVehicleDiagnosisUseCase.js'
import type { ObdRepository } from '@/application/ports/ObdRepository.js'
import { FreezeFrame } from '@/domain/value-objects/freezeFrame.js'
import { Vin } from '@/domain/value-objects/vin.js'

const sensorValues = { rpm: 750, coolantTemp: 90, speed: 0, intakeTemp: 25 }
const dtcCodes = [{ code: 'P0301', description: 'Cylinder 1 Misfire' }]

function mockRepo(overrides: Partial<ObdRepository> = {}): ObdRepository {
  return {
    readPid: vi.fn().mockImplementation((_mode: string, pid: string) => {
      const map: Record<string, number> = {
        '0C': sensorValues.rpm,
        '05': sensorValues.coolantTemp,
        '0D': sensorValues.speed,
        '0F': sensorValues.intakeTemp,
      }
      return Promise.resolve(map[pid] ?? 0)
    }),
    getSupportedPids: vi.fn().mockResolvedValue(['01 0C', '01 05', '01 0D', '01 0F']),
    getFreezeFrame: vi.fn().mockResolvedValue(null),
    readDtcCodes: vi.fn().mockResolvedValue(dtcCodes),
    clearDtcCodes: vi.fn().mockResolvedValue(undefined),
    readVin: vi.fn().mockResolvedValue('WAUZZZ8V5JA123456'),
    getVehicleInfo: vi.fn().mockResolvedValue({
      make: 'Audi',
      model: 'A3',
      year: 2018,
      engineType: '2.0 TFSI',
      vin: new Vin('WAUZZZ8V5JA123456'),
    }),
    setPower: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function mockFreezeFrame(): FreezeFrame {
  return new FreezeFrame({
    dtcCode: 'P0301',
    pidValues: { rpm: 800, coolantTemp: 95, speed: 60 },
  })
}

describe('processVehicleDiagnosis', () => {
  it('should return parsed values from the repository', async () => {
    const repo = mockRepo()

    const result = await new ProcessVehicleDiagnosisUseCase(repo).execute()

    expect(result.parsedValues).toEqual(sensorValues)
    expect(repo.readPid).toHaveBeenCalledTimes(4)
  })

  it('should include DTC codes from the repository', async () => {
    const repo = mockRepo()

    const result = await new ProcessVehicleDiagnosisUseCase(repo).execute()

    expect(result.dtcCodes).toEqual(dtcCodes)
    expect(repo.readDtcCodes).toHaveBeenCalledOnce()
  })

  it('should set severity to high when DTC codes are present with no freeze frame', async () => {
    const repo = mockRepo({ getFreezeFrame: vi.fn().mockResolvedValue(null) })

    const result = await new ProcessVehicleDiagnosisUseCase(repo).execute()

    expect(result.severity).toBe('high')
  })

  it('should set severity to critical when DTC codes are present with freeze frame', async () => {
    const repo = mockRepo({
      readDtcCodes: vi.fn().mockResolvedValue(dtcCodes),
      getFreezeFrame: vi.fn().mockResolvedValue(mockFreezeFrame()),
    })

    const result = await new ProcessVehicleDiagnosisUseCase(repo).execute()

    expect(result.severity).toBe('critical')
  })

  it('should set severity to low when no DTC codes are present', async () => {
    const repo = mockRepo({
      readDtcCodes: vi.fn().mockResolvedValue([]),
      getFreezeFrame: vi.fn().mockResolvedValue(null),
    })

    const result = await new ProcessVehicleDiagnosisUseCase(repo).execute()

    expect(result.severity).toBe('low')
    expect(result.dtcCodes).toHaveLength(0)
  })

  it('should derive severity from the entity instead of accepting it', async () => {
    const repo = mockRepo()

    const result = await new ProcessVehicleDiagnosisUseCase(repo).execute()

    expect(result.hasFreezeFrame).toBe(false)
    expect(result.dtcCount).toBe(dtcCodes.length)
    expect(result.severity).toBe('high')
    expect(result).not.toHaveProperty('diagnosisText')
    expect(result).not.toHaveProperty('rawData')
  })
})
