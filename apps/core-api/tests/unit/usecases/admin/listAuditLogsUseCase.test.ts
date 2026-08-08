import { describe, it, expect, vi } from 'vitest'
import { ListAuditLogsUseCase } from '@/application/use-cases/admin/ListAuditLogsUseCase.js'
import type { AuditLogRepository } from '@/application/ports/AuditLogRepository.js'
import { adminAuditFilterSchema } from '@/application/dto/admin/AdminAuditFilter.js'

function createAuditRepo(): AuditLogRepository {
  return {
    create: vi.fn(),
    list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    stats: vi.fn(),
  }
}

describe('ListAuditLogsUseCase', () => {
  it('should delegate on AuditLogRepository.list with the validated filter', async () => {
    const auditRepo = createAuditRepo()
    const useCase = new ListAuditLogsUseCase(auditRepo)
    const filter = adminAuditFilterSchema.parse({ statusCode: 500 })

    const result = await useCase.execute(filter)

    expect(auditRepo.list).toHaveBeenCalledWith(filter)
    expect(result).toEqual({ items: [], total: 0 })
  })
})
