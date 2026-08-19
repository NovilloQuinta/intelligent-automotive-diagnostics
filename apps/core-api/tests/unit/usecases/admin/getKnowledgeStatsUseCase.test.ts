import { describe, it, expect, vi } from 'vitest'
import { GetKnowledgeStatsUseCase } from '@/application/use-cases/admin/GetKnowledgeStatsUseCase.js'
import type { VectorStorePort } from '@/application/ports/VectorStorePort.js'

function createStore(count: number, sample: Record<string, unknown>[]): VectorStorePort {
  return {
    upsert: vi.fn(),
    query: vi.fn(),
    count: vi.fn().mockResolvedValue(count),
    sample: vi.fn().mockResolvedValue(sample),
  }
}

describe('GetKnowledgeStatsUseCase', () => {
  it('should combine count()/sample() of the three indices into a single summary', async () => {
    const pids = createStore(10, [{ id: 'p1' }])
    const dtcs = createStore(5, [{ id: 'd1' }])
    const diagnoses = createStore(2, [{ id: 'g1' }])
    const useCase = new GetKnowledgeStatsUseCase({ pids, dtcs, diagnoses })

    const stats = await useCase.execute()

    expect(stats).toEqual({
      pids: { count: 10, sample: [{ id: 'p1' }] },
      dtcs: { count: 5, sample: [{ id: 'd1' }] },
      diagnoses: { count: 2, sample: [{ id: 'g1' }] },
    })
  })

  it('should use a default sample limit and pass it to each store', async () => {
    const pids = createStore(0, [])
    const dtcs = createStore(0, [])
    const diagnoses = createStore(0, [])
    const useCase = new GetKnowledgeStatsUseCase({ pids, dtcs, diagnoses })

    await useCase.execute()

    expect(pids.sample).toHaveBeenCalledWith(expect.any(Number))
    expect(dtcs.sample).toHaveBeenCalledWith(expect.any(Number))
    expect(diagnoses.sample).toHaveBeenCalledWith(expect.any(Number))
  })

  it('should accept a custom sample limit', async () => {
    const pids = createStore(0, [])
    const dtcs = createStore(0, [])
    const diagnoses = createStore(0, [])
    const useCase = new GetKnowledgeStatsUseCase({ pids, dtcs, diagnoses }, 3)

    await useCase.execute()

    expect(pids.sample).toHaveBeenCalledWith(3)
    expect(dtcs.sample).toHaveBeenCalledWith(3)
    expect(diagnoses.sample).toHaveBeenCalledWith(3)
  })
})
