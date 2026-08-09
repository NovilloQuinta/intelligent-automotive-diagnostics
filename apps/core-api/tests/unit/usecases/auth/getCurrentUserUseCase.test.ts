import { describe, it, expect, vi } from 'vitest'
import {
  GetCurrentUserUseCase,
  UserNotFoundError,
} from '@/application/use-cases/GetCurrentUserUseCase.js'
import type { UserRepository } from '@/application/ports/UserRepository.js'

const USER = {
  id: 1,
  username: 'juan',
  email: 'juan@mail.com',
  passwordHash: '$2b$12$hashed',
  userType: 'individual',
  businessName: null,
  taxId: null,
  address: null,
  createdAt: '2024-01-01T00:00:00Z',
}

function createUserRepo(user: unknown): UserRepository {
  return {
    findByEmail: vi.fn().mockResolvedValue(null),
    findById: vi.fn().mockResolvedValue(user),
    create: vi.fn().mockResolvedValue(USER),
    incrementFailedLogin: vi.fn().mockResolvedValue(undefined),
    resetFailedLogins: vi.fn().mockResolvedValue(undefined),
    updatePassword: vi.fn().mockResolvedValue(undefined),
    updateProfile: vi.fn().mockResolvedValue(undefined),
    existsByUsername: vi.fn().mockResolvedValue(false),
  }
}

describe('GetCurrentUserUseCase', () => {
  it('should return the user without passwordHash', async () => {
    const userRepo = createUserRepo(USER)
    const useCase = new GetCurrentUserUseCase(userRepo)

    const result = await useCase.execute(1)

    expect(userRepo.findById).toHaveBeenCalledWith(1)
    expect(result).not.toHaveProperty('passwordHash')
    expect(result.id).toBe(1)
    expect(result.username).toBe('juan')
    expect(result.email).toBe('juan@mail.com')
  })

  it('should throw UserNotFoundError when the user does not exist', async () => {
    const userRepo = createUserRepo(null)
    const useCase = new GetCurrentUserUseCase(userRepo)

    await expect(useCase.execute(999)).rejects.toBeInstanceOf(UserNotFoundError)
  })
})
