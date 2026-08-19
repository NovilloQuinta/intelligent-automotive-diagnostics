import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  ResetPasswordUseCase,
  InvalidOrExpiredTokenError,
} from '@/application/use-cases/ResetPasswordUseCase.js'
import type { UserRepository } from '@/application/ports/UserRepository.js'
import type { PasswordResetTokenRepository } from '@/application/ports/PasswordResetTokenRepository.js'
import type { AuthServicePort } from '@/application/ports/AuthServicePort.js'
import type { RefreshTokenRepository } from '@/application/ports/RefreshTokenRepository.js'
import type { User } from '@/domain/entities/User.js'
import type { PasswordResetTokenRecord } from '@/application/dto/auth/PasswordResetTokenRecord.js'
import { Email } from '@/domain/value-objects/Email.js'
import { hashToken } from '@/application/shared/hashToken.js'

const RAW_TOKEN = 'raw-reset-token'
const TOKEN_HASH = hashToken(RAW_TOKEN)

const USER: User = {
  id: 1,
  username: 'juan',
  email: new Email('juan@mail.com'),
  passwordHash: '$2b$12$oldhash',
  userType: 'individual',
  businessName: null,
  taxId: null,
  address: null,
  createdAt: '2024-01-01T00:00:00Z',
  failedLoginAttempts: 3,
  lockedUntil: null,
  isWorkshop: false,
}

function validRecord(overrides: Partial<PasswordResetTokenRecord> = {}): PasswordResetTokenRecord {
  return {
    id: 1,
    userId: 1,
    tokenHash: TOKEN_HASH,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    usedAt: null,
    ...overrides,
  }
}

function createMocks(
  overrides: {
    userRepo?: Partial<UserRepository>
    tokenRepo?: Partial<PasswordResetTokenRepository>
    authService?: Partial<AuthServicePort>
    refreshTokenRepo?: Partial<RefreshTokenRepository>
  } = {},
) {
  const userRepo: UserRepository = {
    findByEmail: vi.fn().mockResolvedValue(USER),
    findById: vi.fn().mockResolvedValue(USER),
    create: vi.fn().mockResolvedValue(USER),
    incrementFailedLogin: vi.fn().mockResolvedValue({ failedLoginAttempts: 1, lockedUntil: null }),
    resetFailedLogins: vi.fn().mockResolvedValue(undefined),
    updatePassword: vi.fn().mockResolvedValue(undefined),
    updateProfile: vi.fn().mockResolvedValue(USER),
    existsByUsername: vi.fn().mockResolvedValue(false),
    ...overrides.userRepo,
  }

  const tokenRepo: PasswordResetTokenRepository = {
    save: vi.fn().mockResolvedValue(undefined),
    findByTokenHash: vi.fn().mockResolvedValue(validRecord()),
    markUsed: vi.fn().mockResolvedValue(undefined),
    invalidateAllForUser: vi.fn().mockResolvedValue(undefined),
    ...overrides.tokenRepo,
  }

  const authService: AuthServicePort = {
    hashPassword: vi.fn().mockResolvedValue('$2b$12$newhash'),
    comparePassword: vi.fn().mockResolvedValue(true),
    generateTokens: vi.fn().mockReturnValue({ accessToken: 'a', refreshToken: 'r' }),
    verifyAccessToken: vi.fn().mockReturnValue(1),
    refreshAccessToken: vi.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' }),
    ...overrides.authService,
  }

  const refreshTokenRepo: RefreshTokenRepository = {
    saveRefreshToken: vi.fn().mockResolvedValue(undefined),
    findRefreshToken: vi.fn().mockResolvedValue(null),
    revokeRefreshToken: vi.fn().mockResolvedValue(undefined),
    revokeAllForUser: vi.fn().mockResolvedValue(undefined),
    ...overrides.refreshTokenRepo,
  }

  return { userRepo, tokenRepo, authService, refreshTokenRepo }
}

describe('ResetPasswordUseCase', () => {
  let mocks: ReturnType<typeof createMocks>
  let useCase: ResetPasswordUseCase

  beforeEach(() => {
    mocks = createMocks()
    useCase = new ResetPasswordUseCase(
      mocks.tokenRepo,
      mocks.userRepo,
      mocks.authService,
      mocks.refreshTokenRepo,
    )
  })

  it('deberia actualizar la contraseña, marcar el token usado y revocar refresh tokens', async () => {
    await useCase.execute({ token: RAW_TOKEN, newPassword: 'NewPass1!' })

    expect(mocks.authService.hashPassword).toHaveBeenCalledWith('NewPass1!')
    expect(mocks.userRepo.updatePassword).toHaveBeenCalledWith(1, '$2b$12$newhash')
    expect(mocks.tokenRepo.markUsed).toHaveBeenCalledWith(TOKEN_HASH)
    expect(mocks.refreshTokenRepo.revokeAllForUser).toHaveBeenCalledWith(1)
    expect(mocks.userRepo.resetFailedLogins).toHaveBeenCalledWith(1)
  })

  it('deberia lanzar InvalidOrExpiredTokenError si el token no existe', async () => {
    mocks = createMocks({ tokenRepo: { findByTokenHash: vi.fn().mockResolvedValue(null) } })
    useCase = new ResetPasswordUseCase(
      mocks.tokenRepo,
      mocks.userRepo,
      mocks.authService,
      mocks.refreshTokenRepo,
    )

    await expect(
      useCase.execute({ token: RAW_TOKEN, newPassword: 'NewPass1!' }),
    ).rejects.toBeInstanceOf(InvalidOrExpiredTokenError)
  })

  it('deberia lanzar InvalidOrExpiredTokenError si el token esta caducado', async () => {
    mocks = createMocks({
      tokenRepo: {
        findByTokenHash: vi
          .fn()
          .mockResolvedValue(validRecord({ expiresAt: new Date(Date.now() - 1000).toISOString() })),
      },
    })
    useCase = new ResetPasswordUseCase(
      mocks.tokenRepo,
      mocks.userRepo,
      mocks.authService,
      mocks.refreshTokenRepo,
    )

    await expect(
      useCase.execute({ token: RAW_TOKEN, newPassword: 'NewPass1!' }),
    ).rejects.toBeInstanceOf(InvalidOrExpiredTokenError)
  })

  it('deberia lanzar InvalidOrExpiredTokenError si el token ya fue usado', async () => {
    mocks = createMocks({
      tokenRepo: {
        findByTokenHash: vi
          .fn()
          .mockResolvedValue(validRecord({ usedAt: new Date().toISOString() })),
      },
    })
    useCase = new ResetPasswordUseCase(
      mocks.tokenRepo,
      mocks.userRepo,
      mocks.authService,
      mocks.refreshTokenRepo,
    )

    await expect(
      useCase.execute({ token: RAW_TOKEN, newPassword: 'NewPass1!' }),
    ).rejects.toBeInstanceOf(InvalidOrExpiredTokenError)
  })

  it('deberia lanzar ZodError si la nueva contraseña es debil', async () => {
    await expect(useCase.execute({ token: RAW_TOKEN, newPassword: 'weak' })).rejects.toThrow()
    expect(mocks.userRepo.updatePassword).not.toHaveBeenCalled()
  })
})
