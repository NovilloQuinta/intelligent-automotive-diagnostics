import { describe, it, expect, vi } from 'vitest'
import { GetLiveDataUseCase } from '@/application/use-cases/GetLiveDataUseCase.js'
import type { ObdRepository } from '@/application/ports/ObdRepository.js'
import {
  MODE_CURRENT_DATA,
  PID_RPM,
  PID_COOLANT_TEMP,
  PID_SPEED,
  PID_INTAKE_TEMP,
  DEFAULT_LIVE_PIDS,
} from '@/domain/pids.js'

/** Devuelve un repositorio cuyo `readPids` responde el mapa dado, y registra lo que le piden. */
function mockRepo(values: Record<string, number | null> = {}): ObdRepository {
  return {
    readPids: vi.fn().mockImplementation((_mode: string, pids: readonly string[]) => {
      const map = new Map<string, number>()
      for (const pid of pids) {
        const value = values[pid]
        if (value !== undefined && value !== null) map.set(pid, value)
      }
      return Promise.resolve(map)
    }),
  } as unknown as ObdRepository
}

const useCase = new GetLiveDataUseCase()

describe('GetLiveDataUseCase', () => {
  it('should map the four gauge PIDs to their telemetry fields', async () => {
    const repo = mockRepo({
      [PID_RPM]: 770,
      [PID_COOLANT_TEMP]: 90,
      [PID_SPEED]: 0,
      [PID_INTAKE_TEMP]: 35,
    })

    const result = await useCase.execute(repo)

    expect(result.rpm).toBe(770)
    expect(result.coolantTemp).toBe(90)
    expect(result.speed).toBe(0)
    expect(result.intakeTemp).toBe(35)
  })

  it('should fall back to the default live PIDs when none are requested', async () => {
    const repo = mockRepo()

    await useCase.execute(repo)

    expect(repo.readPids).toHaveBeenCalledWith(MODE_CURRENT_DATA, [...DEFAULT_LIVE_PIDS])
  })

  it('should normalise requested PIDs to uppercase', async () => {
    const repo = mockRepo()

    await useCase.execute(repo, ['0c', '0d'])

    expect(repo.readPids).toHaveBeenCalledWith(MODE_CURRENT_DATA, ['0C', '0D'])
  })

  it('should degrade an unsupported PID to null instead of failing', async () => {
    const repo = mockRepo({ [PID_RPM]: 770 })

    const result = await useCase.execute(repo, [PID_RPM, PID_SPEED])

    expect(result.rpm).toBe(770)
    expect(result.speed).toBeNull()
    expect(result.readings.find((r) => r.code.endsWith(PID_SPEED))?.value).toBeNull()
  })

  it('should take name and unit for each reading from the catalog', async () => {
    const repo = mockRepo({ [PID_RPM]: 770 })

    const { readings } = await useCase.execute(repo, [PID_RPM])

    expect(readings).toHaveLength(1)
    expect(readings[0].code).toBe(`${MODE_CURRENT_DATA} ${PID_RPM}`)
    expect(readings[0].name).not.toBe(PID_RPM)
    expect(readings[0].unit).toBe('rpm')
  })

  it('should fall back to the PID code as name when it is not in the catalog', async () => {
    const repo = mockRepo()

    const { readings } = await useCase.execute(repo, ['FF'])

    expect(readings[0].name).toBe('FF')
    expect(readings[0].unit).toBe('')
    expect(readings[0].value).toBeNull()
  })

  it('should return a reading per requested PID beyond the four gauges', async () => {
    const repo = mockRepo({ '0B': 101, '11': 14 })

    const { readings } = await useCase.execute(repo, ['0B', '11'])

    expect(readings.map((r) => r.value)).toEqual([101, 14])
  })
})
