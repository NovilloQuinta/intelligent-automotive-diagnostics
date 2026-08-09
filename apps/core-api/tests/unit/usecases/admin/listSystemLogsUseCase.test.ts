import { describe, it, expect, vi } from 'vitest'
import { ListSystemLogsUseCase } from '@/application/use-cases/admin/ListSystemLogsUseCase.js'
import type { LogRepository } from '@/application/ports/LogRepository.js'
import { adminLogsFilterSchema } from '@/application/dto/admin/AdminLogsFilter.js'

describe('ListSystemLogsUseCase', () => {
  it('should delegate on LogRepository.list with the validated filter', async () => {
    const expected = { items: [], total: 0 }
    const logRepo: LogRepository = { list: vi.fn().mockResolvedValue(expected) }
    const useCase = new ListSystemLogsUseCase(logRepo)
    const filter = adminLogsFilterSchema.parse({ level: 'error' })

    const result = await useCase.execute(filter)

    expect(logRepo.list).toHaveBeenCalledWith(filter)
    expect(result).toBe(expected)
  })
})
