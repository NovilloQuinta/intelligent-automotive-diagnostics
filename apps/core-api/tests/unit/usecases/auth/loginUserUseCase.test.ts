import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  LoginUserUseCase,
  InvalidCredentialsError,
  AccountLockedError,
} from '@/application/use-cases/LoginUserUseCase.js'
import type { UserRepository } from '@/application/ports/UserRepository.js'
import type { AuthServicePort } from '@/application/ports/AuthServicePort.js'
import type { RefreshTokenRepository } from '@/application/ports/RefreshTokenRepository.js'
import type { User } from '@/domain/entities/user.js'
import { Email } from '@/domain/value-objects/email.js'

const USER: User = {
  id: 1,
  username: 'juan',
  email: new Email('juan@mail.com'),
  passwordHash: '$2b$12$hashed',
  userType: 'individual',
  businessName: null,
  taxId: null,
  address: null,
  createdAt: '2024-01-01T00:00:00Z',
  failedLoginAttempts: 0,
  lockedUntil: null,
  isWorkshop: false,
}

function createMocks(
  overrides: {
    userRepo?: Partial<UserRepository>
    authService?: Partial<AuthServicePort>
  } = {},
) {
  const userRepo: UserRepository = {
    findByEmail: vi.fn().mockResolvedValue(USER),
    findById: vi.fn().mockResolvedValue(USER),
    create: vi.fn().mockResolvedValue(USER),
    incrementFailedLogin: vi.fn().mockResolvedValue(undefined),
    resetFailedLogins: vi.fn().mockResolvedValue(undefined),
    ...overrides.userRepo,
  }

  const authService: AuthServicePort = {
    hashPassword: vi.fn().mockResolvedValue('$2b$12$hashed'),
    comparePassword: vi.fn().mockResolvedValue(true),
    generateTokens: vi.fn().mockReturnValue({
      accessToken: 'access-abc',
      refreshToken: 'refresh-abc',
    }),
    verifyAccessToken: vi.fn().mockReturnValue(1),
    refreshAccessToken: vi.fn().mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    }),
    ...overrides.authService,
  }

  const tokenStore: RefreshTokenRepository = {
    saveRefreshToken: vi.fn().mockResolvedValue(undefined),
    findRefreshToken: vi.fn().mockResolvedValue(null),
    revokeRefreshToken: vi.fn().mockResolvedValue(undefined),
  }

  return { userRepo, authService, tokenStore }
}

describe('LoginUserUseCase', () => {
  let useCase: LoginUserUseCase
  let mocks: ReturnType<typeof createMocks>

  beforeEach(() => {
    mocks = createMocks()
    useCase = new LoginUserUseCase(mocks.userRepo, mocks.authService, mocks.tokenStore)
  })

  it('deberia devolver tokens en login exitoso', async () => {
    const result = await useCase.execute({
      email: 'juan@mail.com',
      password: 'correct-password',
    })

    expect(result.accessToken).toBe('access-abc')
    expect(result.refreshToken).toBe('refresh-abc')
    expect(mocks.userRepo.resetFailedLogins).toHaveBeenCalledWith(1)
  })

  it('deberia lanzar InvalidCredentialsError si el usuario no existe', async () => {
    mocks.userRepo.findByEmail = vi.fn().mockResolvedValue(null)

    await expect(useCase.execute({ email: 'no@mail.com', password: 'any' })).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    )

    expect(mocks.userRepo.incrementFailedLogin).not.toHaveBeenCalled()
  })

  it('deberia lanzar InvalidCredentialsError si la contraseña es incorrecta', async () => {
    mocks.authService.comparePassword = vi.fn().mockResolvedValue(false)

    await expect(
      useCase.execute({ email: 'juan@mail.com', password: 'wrong' }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError)

    expect(mocks.userRepo.incrementFailedLogin).toHaveBeenCalledWith(1)
  })

  it('deberia lanzar AccountLockedError si la cuenta esta bloqueada', async () => {
    const lockedUser = {
      ...USER,
      lockedUntil: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 min in future
    }
    mocks.userRepo.findByEmail = vi.fn().mockResolvedValue(lockedUser)

    await expect(
      useCase.execute({ email: 'juan@mail.com', password: 'any' }),
    ).rejects.toBeInstanceOf(AccountLockedError)
  })

  it('deberia permitir login si el bloqueo ya expiro', async () => {
    const unlockedUser = {
      ...USER,
      lockedUntil: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 min in past
      failedLoginAttempts: 5,
    }
    mocks.userRepo.findByEmail = vi.fn().mockResolvedValue(unlockedUser)

    const result = await useCase.execute({
      email: 'juan@mail.com',
      password: 'correct-password',
    })

    expect(result.accessToken).toBe('access-abc')
  })
})
