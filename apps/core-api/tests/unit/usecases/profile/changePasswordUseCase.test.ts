import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  ChangePasswordUseCase,
  IncorrectCurrentPasswordError,
  SamePasswordError,
} from '@/application/use-cases/ChangePasswordUseCase.js'
import { UserNotFoundError } from '@/application/use-cases/GetCurrentUserUseCase.js'
import type { UserRepository } from '@/application/ports/UserRepository.js'
import type { AuthServicePort } from '@/application/ports/AuthServicePort.js'
import type { RefreshTokenRepository } from '@/application/ports/RefreshTokenRepository.js'
import type { User } from '@/domain/entities/user.js'
import { Email } from '@/domain/value-objects/email.js'

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
  failedLoginAttempts: 0,
  lockedUntil: null,
  isWorkshop: false,
}

function createMocks(
  overrides: {
    userRepo?: Partial<UserRepository>
    authService?: Partial<AuthServicePort>
    refreshTokenRepo?: Partial<RefreshTokenRepository>
  } = {},
) {
  const userRepo: UserRepository = {
    findByEmail: vi.fn().mockResolvedValue(USER),
    findById: vi.fn().mockResolvedValue(USER),
    create: vi.fn().mockResolvedValue(USER),
    incrementFailedLogin: vi.fn().mockResolvedValue(undefined),
    resetFailedLogins: vi.fn().mockResolvedValue(undefined),
    updatePassword: vi.fn().mockResolvedValue(undefined),
    updateProfile: vi.fn().mockResolvedValue(USER),
    existsByUsername: vi.fn().mockResolvedValue(false),
    ...overrides.userRepo,
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

  return { userRepo, authService, refreshTokenRepo }
}

describe('ChangePasswordUseCase', () => {
  let mocks: ReturnType<typeof createMocks>
  let useCase: ChangePasswordUseCase

  beforeEach(() => {
    mocks = createMocks()
    useCase = new ChangePasswordUseCase(mocks.userRepo, mocks.authService, mocks.refreshTokenRepo)
  })

  it('deberia actualizar la contraseña y revocar refresh tokens tras exito', async () => {
    await useCase.execute(1, { currentPassword: 'OldPass1!', newPassword: 'NewPass1!' })

    expect(mocks.authService.comparePassword).toHaveBeenCalledWith('OldPass1!', '$2b$12$oldhash')
    expect(mocks.authService.hashPassword).toHaveBeenCalledWith('NewPass1!')
    expect(mocks.userRepo.updatePassword).toHaveBeenCalledWith(1, '$2b$12$newhash')
    expect(mocks.refreshTokenRepo.revokeAllForUser).toHaveBeenCalledWith(1)
  })

  it('deberia lanzar IncorrectCurrentPasswordError si la contraseña actual es incorrecta', async () => {
    mocks = createMocks({ authService: { comparePassword: vi.fn().mockResolvedValue(false) } })
    useCase = new ChangePasswordUseCase(mocks.userRepo, mocks.authService, mocks.refreshTokenRepo)

    await expect(
      useCase.execute(1, { currentPassword: 'Wrong1!', newPassword: 'NewPass1!' }),
    ).rejects.toBeInstanceOf(IncorrectCurrentPasswordError)
    expect(mocks.userRepo.updatePassword).not.toHaveBeenCalled()
  })

  it('deberia lanzar SamePasswordError si la nueva contraseña es igual a la actual', async () => {
    await expect(
      useCase.execute(1, { currentPassword: 'SamePass1!', newPassword: 'SamePass1!' }),
    ).rejects.toBeInstanceOf(SamePasswordError)
    expect(mocks.userRepo.updatePassword).not.toHaveBeenCalled()
  })

  it('deberia lanzar UserNotFoundError si el usuario no existe', async () => {
    mocks = createMocks({ userRepo: { findById: vi.fn().mockResolvedValue(null) } })
    useCase = new ChangePasswordUseCase(mocks.userRepo, mocks.authService, mocks.refreshTokenRepo)

    await expect(
      useCase.execute(999, { currentPassword: 'OldPass1!', newPassword: 'NewPass1!' }),
    ).rejects.toBeInstanceOf(UserNotFoundError)
  })

  it('deberia lanzar ZodError si la nueva contraseña es debil', async () => {
    await expect(
      useCase.execute(1, { currentPassword: 'OldPass1!', newPassword: 'weak' }),
    ).rejects.toThrow()
  })
})
