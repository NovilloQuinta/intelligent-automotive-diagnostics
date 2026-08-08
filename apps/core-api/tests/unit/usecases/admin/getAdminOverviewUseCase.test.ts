import { describe, it, expect, vi } from 'vitest'
import { GetAdminOverviewUseCase } from '@/application/use-cases/admin/GetAdminOverviewUseCase.js'
import type { UserRepository } from '@/application/ports/UserRepository.js'
import type { LogRepository } from '@/application/ports/LogRepository.js'
import type { AuditLogRepository } from '@/application/ports/AuditLogRepository.js'

function createUserRepo(): UserRepository {
  return {
    findByEmail: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    incrementFailedLogin: vi.fn(),
    resetFailedLogins: vi.fn(),
    list: vi.fn(),
    stats: vi.fn().mockResolvedValue({ byUserType: { individual: 3 }, byRole: { user: 3 } }),
  }
}

function createLogRepo(errorTotal: number): LogRepository {
  return { list: vi.fn().mockResolvedValue({ items: [], total: errorTotal }) }
}

function createAuditRepo(): AuditLogRepository {
  return {
    create: vi.fn(),
    list: vi.fn(),
    stats: vi.fn().mockResolvedValue({
      byStatusCode: { '200': 10, '500': 1 },
      byPath: { '/api/diagnosis': 8, '/api/auth/login': 3 },
    }),
  }
}

describe('GetAdminOverviewUseCase', () => {
  it('should aggregate user totals, recent errors and HTTP activity by path', async () => {
    const userRepo = createUserRepo()
    const logRepo = createLogRepo(7)
    const auditRepo = createAuditRepo()
    const useCase = new GetAdminOverviewUseCase({ userRepo, logRepo, auditRepo })

    const overview = await useCase.execute()

    expect(overview.userStats).toEqual({ byUserType: { individual: 3 }, byRole: { user: 3 } })
    expect(overview.recentErrorCount).toBe(7)
    expect(overview.httpRequestsByPathApprox).toEqual({
      '/api/diagnosis': 8,
      '/api/auth/login': 3,
    })
  })

  it('should filter recent errors by level "error" and a bounded recent window', async () => {
    const userRepo = createUserRepo()
    const logRepo = createLogRepo(2)
    const auditRepo = createAuditRepo()
    const useCase = new GetAdminOverviewUseCase({ userRepo, logRepo, auditRepo })

    await useCase.execute()

    expect(logRepo.list).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'error', from: expect.any(String) }),
    )
  })

  it('should query audit stats without a date range by default (all-time activity)', async () => {
    const userRepo = createUserRepo()
    const logRepo = createLogRepo(0)
    const auditRepo = createAuditRepo()
    const useCase = new GetAdminOverviewUseCase({ userRepo, logRepo, auditRepo })

    await useCase.execute()

    expect(auditRepo.stats).toHaveBeenCalledWith({})
  })
})
