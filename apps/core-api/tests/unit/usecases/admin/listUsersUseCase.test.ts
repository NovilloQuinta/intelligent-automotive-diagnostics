import { describe, it, expect, vi } from 'vitest'
import { ListUsersUseCase } from '@/application/use-cases/admin/ListUsersUseCase.js'
import type { UserRepository } from '@/application/ports/UserRepository.js'
import { adminUsersFilterSchema } from '@/application/dto/admin/AdminUsersFilter.js'

function createUserRepo(): UserRepository {
  return {
    findByEmail: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    incrementFailedLogin: vi.fn(),
    resetFailedLogins: vi.fn(),
    list: vi.fn().mockResolvedValue({
      items: [{ id: 1, username: 'juan', email: 'juan@mail.com', role: 'user' }],
      total: 1,
    }),
    stats: vi.fn(),
  }
}

describe('ListUsersUseCase', () => {
  it('should delegate on UserRepository.list with the validated filter', async () => {
    const userRepo = createUserRepo()
    const useCase = new ListUsersUseCase(userRepo)
    const filter = adminUsersFilterSchema.parse({ q: 'juan' })

    const result = await useCase.execute(filter)

    expect(userRepo.list).toHaveBeenCalledWith(filter)
    expect(result.total).toBe(1)
  })

  it('should never leak passwordHash even if the repository returned it', async () => {
    const userRepo = createUserRepo()
    vi.mocked(userRepo.list).mockResolvedValue({
      items: [
        {
          id: 1,
          username: 'juan',
          email: 'juan@mail.com',
          role: 'user',
          passwordHash: '$2b$12$leaked',
        } as never,
      ],
      total: 1,
    })
    const useCase = new ListUsersUseCase(userRepo)

    const result = await useCase.execute(adminUsersFilterSchema.parse({}))

    for (const item of result.items) {
      expect(item).not.toHaveProperty('passwordHash')
    }
  })
})
