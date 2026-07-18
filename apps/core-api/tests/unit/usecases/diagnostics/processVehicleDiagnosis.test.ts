import { describe, it, expect, vi } from 'vitest'
import { processVehicleDiagnosis } from '@/application/diagnostics/processVehicleDiagnosis.js'
import type { ObdRepository } from '@/application/ports/obdRepository.interface.js'

const liveData = { rpm: 750, coolantTemp: 90, speed: 0, intakeTemp: 25 }
const dtcCodes = [{ code: 'P0301', description: 'Cylinder 1 Misfire' }]

function mockRepo(overrides: Partial<ObdRepository> = {}): ObdRepository {
  return {
    readLiveData: vi.fn().mockResolvedValue(liveData),
    readDtcCodes: vi.fn().mockResolvedValue(dtcCodes),
    setPower: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('processVehicleDiagnosis', () => {
  it('should return parsed values from the repository', async () => {
    const repo = mockRepo()

    const result = await processVehicleDiagnosis(repo)

    expect(result.parsedValues).toEqual(liveData)
    expect(repo.readLiveData).toHaveBeenCalledOnce()
  })

  it('should include DTC codes from the repository', async () => {
    const repo = mockRepo()

    const result = await processVehicleDiagnosis(repo)

    expect(result.dtcCodes).toEqual(dtcCodes)
    expect(repo.readDtcCodes).toHaveBeenCalledOnce()
  })

  it('should set severity to critical when DTC codes are present', async () => {
    const repo = mockRepo()

    const result = await processVehicleDiagnosis(repo)

    expect(result.severity).toBe('critical')
  })

  it('should set severity to low when no DTC codes are present', async () => {
    const repo = mockRepo({
      readDtcCodes: vi.fn().mockResolvedValue([]),
    })

    const result = await processVehicleDiagnosis(repo)

    expect(result.severity).toBe('low')
    expect(result.dtcCodes).toHaveLength(0)
  })

  it('should generate a human-readable diagnosis text', async () => {
    const repo = mockRepo()

    const result = await processVehicleDiagnosis(repo)

    expect(result.diagnosisText).toBeTruthy()
    expect(result.diagnosisText).toContain('P0301')
  })

  it('should include raw data representation', async () => {
    const repo = mockRepo()

    const result = await processVehicleDiagnosis(repo)

    expect(result.rawData).toBeTruthy()
  })
})
