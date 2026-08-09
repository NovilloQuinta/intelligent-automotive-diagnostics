import { describe, it, expect, vi } from 'vitest'
import { RegisterUserUseCase } from '@/application/use-cases/RegisterUserUseCase.js'
import type { UserRepository } from '@/application/ports/UserRepository.js'
import type { AuthServicePort } from '@/application/ports/AuthServicePort.js'
import type { RefreshTokenRepository } from '@/application/ports/RefreshTokenRepository.js'
import type { CreateUserInput } from '@/application/dto/auth/CreateUserInput.js'
import { User } from '@/domain/entities/user.js'

function createUserRepo(): UserRepository {
  return {
    findByEmail: vi.fn().mockResolvedValue(null),
    findById: vi.fn(),
    create: vi.fn().mockImplementation(async (input: CreateUserInput) => {
      return new User({
        id: 1,
        username: input.username,
        email: input.email,
        passwordHash: input.passwordHash,
        userType: input.userType,
        role: input.role,
        createdAt: '2024-01-01T00:00:00Z',
      })
    }),
    incrementFailedLogin: vi.fn(),
    resetFailedLogins: vi.fn(),
  }
}

function createAuthService(): AuthServicePort {
  return {
    hashPassword: vi.fn().mockResolvedValue('$2b$12$hashed'),
    comparePassword: vi.fn(),
    generateTokens: vi.fn().mockReturnValue({ accessToken: 'access', refreshToken: 'refresh' }),
    verifyAccessToken: vi.fn(),
    refreshAccessToken: vi.fn(),
  }
}

function createTokenStore(): RefreshTokenRepository {
  return {
    saveRefreshToken: vi.fn().mockResolvedValue(undefined),
    findRefreshToken: vi.fn(),
    revokeRefreshToken: vi.fn(),
  }
}

describe('RegisterUserUseCase', () => {
  it('should create the user with role "user" by default, without the caller passing it', async () => {
    const userRepo = createUserRepo()
    const useCase = new RegisterUserUseCase(userRepo, createAuthService(), createTokenStore())

    const result = await useCase.execute({
      username: 'juan',
      email: 'juan@mail.com',
      password: 'Password123!',
      userType: 'individual',
    })

    expect(userRepo.create).toHaveBeenCalledWith(
      expect.not.objectContaining({ role: expect.anything() }),
    )
    expect(result.user.role).toBe('user')
    expect(result.user.isAdmin).toBe(false)
  })
})
