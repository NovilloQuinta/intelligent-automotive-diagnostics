import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  LoginUserUseCase,
  InvalidCredentialsError,
  AccountLockedError,
  TwoFactorNotConfiguredError,
} from '@/application/use-cases/LoginUserUseCase.js'
import type { UserRepository } from '@/application/ports/UserRepository.js'
import type { AuthServicePort } from '@/application/ports/AuthServicePort.js'
import type { RefreshTokenRepository } from '@/application/ports/RefreshTokenRepository.js'
import type { User } from '@/domain/entities/User.js'
import { Email } from '@/domain/value-objects/Email.js'

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
    incrementFailedLogin: vi.fn().mockResolvedValue({ failedLoginAttempts: 1, lockedUntil: null }),
    resetFailedLogins: vi.fn().mockResolvedValue(undefined),
    updatePassword: vi.fn().mockResolvedValue(undefined),
    updateProfile: vi.fn().mockResolvedValue(USER),
    existsByUsername: vi.fn().mockResolvedValue(false),
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
    revokeAllForUser: vi.fn().mockResolvedValue(undefined),
  }

  return { userRepo, authService, tokenStore }
}

describe('LoginUserUseCase', () => {
  let useCase: LoginUserUseCase
  let mocks: ReturnType<typeof createMocks>

  beforeEach(() => {
    mocks = createMocks()
    useCase = new LoginUserUseCase(mocks.userRepo, mocks.authService, mocks.tokenStore, 604800000)
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

  it('deberia responder AccountLockedError en el mismo intento que alcanza el umbral', async () => {
    const lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString()
    mocks.authService.comparePassword = vi.fn().mockResolvedValue(false)
    mocks.userRepo.incrementFailedLogin = vi
      .fn()
      .mockResolvedValue({ failedLoginAttempts: 5, lockedUntil })

    // Con un 401 en el 5o fallo el usuario no se entera de que acaba de
    // quedar bloqueado hasta el intento siguiente.
    await expect(
      useCase.execute({ email: 'juan@mail.com', password: 'wrong' }),
    ).rejects.toBeInstanceOf(AccountLockedError)
  })

  it('deberia exponer en el error hasta cuando dura el bloqueo', async () => {
    const lockedUntil = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    mocks.userRepo.findByEmail = vi.fn().mockResolvedValue({ ...USER, lockedUntil })

    const error = await useCase
      .execute({ email: 'juan@mail.com', password: 'any' })
      .catch((e: unknown) => e)

    // Sin este dato la UI solo puede decir "bloqueada", nunca cuanto falta.
    expect(error).toBeInstanceOf(AccountLockedError)
    expect((error as AccountLockedError).lockedUntil).toBe(lockedUntil)
    expect((error as AccountLockedError).retryAfterSeconds).toBeGreaterThan(0)
    expect((error as AccountLockedError).retryAfterSeconds).toBeLessThanOrEqual(600)
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

describe('LoginUserUseCase — segundo factor', () => {
  const USER_2FA = { ...USER, twoFactorEnabled: true } as User

  function createUseCaseWith2fa(overrides: Parameters<typeof createMocks>[0] = {}) {
    const mocks = createMocks({
      ...overrides,
      userRepo: { findByEmail: vi.fn().mockResolvedValue(USER_2FA), ...overrides.userRepo },
    })
    const challengeRepo = {
      save: vi.fn().mockResolvedValue(undefined),
      findByTokenHash: vi.fn().mockResolvedValue(null),
      markUsed: vi.fn().mockResolvedValue(undefined),
      invalidateAllForUser: vi.fn().mockResolvedValue(undefined),
    }
    const useCase = new LoginUserUseCase(
      mocks.userRepo,
      mocks.authService,
      mocks.tokenStore,
      604800000,
      undefined,
      { challengeRepo, challengeTtlMs: 5 * 60 * 1000 },
    )
    return { useCase, mocks, challengeRepo }
  }

  const credentials = { email: 'juan@mail.com', password: 'Password1!' }

  it('no entrega tokens si el usuario tiene el segundo factor activo', async () => {
    const { useCase } = createUseCaseWith2fa()

    const result = await useCase.execute(credentials)

    expect(result.twoFactorRequired).toBe(true)
    expect(result).not.toHaveProperty('accessToken')
    expect(result).not.toHaveProperty('refreshToken')
  })

  it('devuelve un reto con su caducidad', async () => {
    const { useCase } = createUseCaseWith2fa()

    const result = await useCase.execute(credentials)

    expect(result).toMatchObject({
      twoFactorRequired: true,
      challengeToken: expect.any(String),
      expiresAt: expect.any(String),
    })
  })

  it('guarda el reto hasheado, nunca en claro', async () => {
    const { useCase, challengeRepo } = createUseCaseWith2fa()

    const result = await useCase.execute(credentials)

    const [, savedHash] = challengeRepo.save.mock.calls[0] as [number, string, string]
    expect(savedHash).not.toBe((result as { challengeToken: string }).challengeToken)
    expect(savedHash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('emite un reto distinto en cada login', async () => {
    const { useCase } = createUseCaseWith2fa()

    const primero = await useCase.execute(credentials)
    const segundo = await useCase.execute(credentials)

    expect((primero as { challengeToken: string }).challengeToken).not.toBe(
      (segundo as { challengeToken: string }).challengeToken,
    )
  })

  it('invalida los retos anteriores del usuario al emitir uno nuevo', async () => {
    const { useCase, challengeRepo } = createUseCaseWith2fa()

    await useCase.execute(credentials)

    expect(challengeRepo.invalidateAllForUser).toHaveBeenCalledWith(USER_2FA.id)
  })

  it('no emite reto si la contrasena es incorrecta', async () => {
    const { useCase, challengeRepo } = createUseCaseWith2fa({
      authService: { comparePassword: vi.fn().mockResolvedValue(false) },
    })

    await expect(useCase.execute(credentials)).rejects.toThrow(InvalidCredentialsError)
    expect(challengeRepo.save).not.toHaveBeenCalled()
  })

  it('el usuario sin segundo factor sigue recibiendo tokens', async () => {
    const mocks = createMocks()
    const useCase = new LoginUserUseCase(
      mocks.userRepo,
      mocks.authService,
      mocks.tokenStore,
      604800000,
      undefined,
      {
        challengeRepo: {
          save: vi.fn(),
          findByTokenHash: vi.fn(),
          markUsed: vi.fn(),
          invalidateAllForUser: vi.fn(),
        },
        challengeTtlMs: 300000,
      },
    )

    const result = await useCase.execute(credentials)

    expect(result).toMatchObject({ twoFactorRequired: false, accessToken: 'access-abc' })
  })

  it('falla cerrado: sin repositorio de retos, un usuario con 2FA no entra', async () => {
    // Si el cableado se rompe, la alternativa seria emitir tokens saltandose el
    // segundo factor. Mejor un error visible que una puerta abierta en silencio.
    const mocks = createMocks({
      userRepo: { findByEmail: vi.fn().mockResolvedValue(USER_2FA) },
    })
    const useCase = new LoginUserUseCase(
      mocks.userRepo,
      mocks.authService,
      mocks.tokenStore,
      604800000,
    )

    await expect(useCase.execute(credentials)).rejects.toThrow(TwoFactorNotConfiguredError)
  })
})
