import { describe, it, expect, vi } from 'vitest'
import {
  VerifyTwoFactorUseCase,
  InvalidTwoFactorChallengeError,
  InvalidTwoFactorCodeError,
} from '@/application/use-cases/VerifyTwoFactorUseCase.js'
import { AccountLockedError } from '@/application/use-cases/LoginUserUseCase.js'
import { hashToken } from '@/application/shared/hashToken.js'
import type { User } from '@/domain/entities/User.js'
import { Email } from '@/domain/value-objects/Email.js'

const CHALLENGE = 'reto-en-claro'
const CHALLENGE_HASH = hashToken(CHALLENGE)
const TOTP_CODE = '123456'
const RECOVERY_CODE = 'AB2C-XY7Z'
const ENCRYPTED = 'cifrado'
const PLAIN_SECRET = 'JBSWY3DPEHPK3PXP'

const USER = {
  id: 7,
  username: 'juan',
  email: new Email('juan@mail.com'),
  passwordHash: '$2b$12$hashed',
  userType: 'individual',
  createdAt: '2026-01-01T00:00:00Z',
  failedLoginAttempts: 0,
  lockedUntil: null,
  twoFactorEnabled: true,
} as User

const liveChallenge = () => ({
  id: 1,
  userId: USER.id,
  tokenHash: CHALLENGE_HASH,
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  createdAt: new Date().toISOString(),
  usedAt: null,
  rememberMe: false,
})

function createDeps(overrides: Record<string, unknown> = {}) {
  const deps = {
    userRepo: {
      findById: vi.fn().mockResolvedValue(USER),
      findTwoFactorSecret: vi.fn().mockResolvedValue(ENCRYPTED),
      incrementFailedLogin: vi
        .fn()
        .mockResolvedValue({ failedLoginAttempts: 1, lockedUntil: null }),
      resetFailedLogins: vi.fn().mockResolvedValue(undefined),
    },
    challengeRepo: {
      findByTokenHash: vi.fn().mockResolvedValue(liveChallenge()),
      markUsed: vi.fn().mockResolvedValue(undefined),
      save: vi.fn(),
      invalidateAllForUser: vi.fn(),
    },
    recoveryCodeRepo: {
      consume: vi.fn().mockResolvedValue(true),
      replaceAllForUser: vi.fn(),
      countUnused: vi.fn().mockResolvedValue(9),
      deleteAllForUser: vi.fn(),
    },
    totp: {
      verify: vi.fn().mockReturnValue(true),
      generateSecret: vi.fn(),
      toQrDataUri: vi.fn(),
    },
    cipher: {
      decrypt: vi.fn().mockReturnValue(PLAIN_SECRET),
      encrypt: vi.fn(),
    },
    authService: {
      generateTokens: vi.fn().mockReturnValue({ accessToken: 'acc', refreshToken: 'ref' }),
    },
    tokenStore: { saveRefreshToken: vi.fn().mockResolvedValue(undefined) },
    refreshTokenTtlMs: 604800000,
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ...overrides,
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { deps, useCase: new VerifyTwoFactorUseCase(deps as any) }
}

const input = { challengeToken: CHALLENGE, code: TOTP_CODE }

describe('VerifyTwoFactorUseCase', () => {
  describe('camino feliz con TOTP', () => {
    it('devuelve el par de tokens', async () => {
      const { useCase } = createDeps()

      await expect(useCase.execute(input)).resolves.toMatchObject({
        accessToken: 'acc',
        refreshToken: 'ref',
      })
    })

    it('busca el reto por su hash, no por el valor en claro', async () => {
      const { useCase, deps } = createDeps()

      await useCase.execute(input)

      expect(deps.challengeRepo.findByTokenHash).toHaveBeenCalledWith(CHALLENGE_HASH)
    })

    it('descifra el secreto antes de verificar', async () => {
      const { useCase, deps } = createDeps()

      await useCase.execute(input)

      expect(deps.cipher.decrypt).toHaveBeenCalledWith(ENCRYPTED)
      expect(deps.totp.verify).toHaveBeenCalledWith(PLAIN_SECRET, TOTP_CODE)
    })

    it('quema el reto para que no valga dos veces', async () => {
      const { useCase, deps } = createDeps()

      await useCase.execute(input)

      expect(deps.challengeRepo.markUsed).toHaveBeenCalledWith(CHALLENGE_HASH)
    })

    it('limpia el contador de intentos fallidos', async () => {
      const { useCase, deps } = createDeps()

      await useCase.execute(input)

      expect(deps.userRepo.resetFailedLogins).toHaveBeenCalledWith(USER.id)
    })

    it('acepta el codigo con el espacio que pintan las apps', async () => {
      const { useCase, deps } = createDeps()

      await useCase.execute({ challengeToken: CHALLENGE, code: '123 456' })

      expect(deps.totp.verify).toHaveBeenCalledWith(PLAIN_SECRET, TOTP_CODE)
    })
  })

  describe('reto invalido', () => {
    it('rechaza un reto que no existe', async () => {
      const { useCase } = createDeps({
        challengeRepo: { findByTokenHash: vi.fn().mockResolvedValue(null), markUsed: vi.fn() },
      })

      await expect(useCase.execute(input)).rejects.toThrow(InvalidTwoFactorChallengeError)
    })

    it('rechaza un reto ya canjeado', async () => {
      const used = { ...liveChallenge(), usedAt: new Date().toISOString() }
      const { useCase } = createDeps({
        challengeRepo: { findByTokenHash: vi.fn().mockResolvedValue(used), markUsed: vi.fn() },
      })

      await expect(useCase.execute(input)).rejects.toThrow(InvalidTwoFactorChallengeError)
    })

    it('rechaza un reto caducado', async () => {
      const expired = { ...liveChallenge(), expiresAt: new Date(Date.now() - 1000).toISOString() }
      const { useCase } = createDeps({
        challengeRepo: { findByTokenHash: vi.fn().mockResolvedValue(expired), markUsed: vi.fn() },
      })

      await expect(useCase.execute(input)).rejects.toThrow(InvalidTwoFactorChallengeError)
    })

    it('un reto invalido no cuenta como intento fallido de codigo', async () => {
      // El reto lo emite el servidor: fallar ahi no es alguien probando codigos.
      const { useCase, deps } = createDeps({
        challengeRepo: { findByTokenHash: vi.fn().mockResolvedValue(null), markUsed: vi.fn() },
      })

      await expect(useCase.execute(input)).rejects.toThrow()
      expect(deps.userRepo.incrementFailedLogin).not.toHaveBeenCalled()
    })
  })

  describe('codigo incorrecto', () => {
    it('lo rechaza', async () => {
      const { useCase } = createDeps({
        totp: {
          verify: vi.fn().mockReturnValue(false),
          generateSecret: vi.fn(),
          toQrDataUri: vi.fn(),
        },
      })

      await expect(useCase.execute(input)).rejects.toThrow(InvalidTwoFactorCodeError)
    })

    it('suma al contador de intentos fallidos', async () => {
      const { useCase, deps } = createDeps({
        totp: {
          verify: vi.fn().mockReturnValue(false),
          generateSecret: vi.fn(),
          toQrDataUri: vi.fn(),
        },
      })

      await expect(useCase.execute(input)).rejects.toThrow()
      expect(deps.userRepo.incrementFailedLogin).toHaveBeenCalledWith(USER.id)
    })

    it('no quema el reto: un error de tecleo no obliga a repetir el login', async () => {
      const { useCase, deps } = createDeps({
        totp: {
          verify: vi.fn().mockReturnValue(false),
          generateSecret: vi.fn(),
          toQrDataUri: vi.fn(),
        },
      })

      await expect(useCase.execute(input)).rejects.toThrow()
      expect(deps.challengeRepo.markUsed).not.toHaveBeenCalled()
    })

    it('bloquea la cuenta si ese intento alcanza el umbral', async () => {
      const lockedUntil = new Date(Date.now() + 900_000).toISOString()
      const { useCase } = createDeps({
        totp: {
          verify: vi.fn().mockReturnValue(false),
          generateSecret: vi.fn(),
          toQrDataUri: vi.fn(),
        },
        userRepo: {
          findById: vi.fn().mockResolvedValue(USER),
          findTwoFactorSecret: vi.fn().mockResolvedValue(ENCRYPTED),
          incrementFailedLogin: vi.fn().mockResolvedValue({ failedLoginAttempts: 5, lockedUntil }),
          resetFailedLogins: vi.fn(),
        },
      })

      await expect(useCase.execute(input)).rejects.toThrow(AccountLockedError)
    })

    it('no deja pasar a una cuenta ya bloqueada', async () => {
      const locked = { ...USER, lockedUntil: new Date(Date.now() + 900_000).toISOString() } as User
      const { useCase } = createDeps({
        userRepo: {
          findById: vi.fn().mockResolvedValue(locked),
          findTwoFactorSecret: vi.fn().mockResolvedValue(ENCRYPTED),
          incrementFailedLogin: vi.fn(),
          resetFailedLogins: vi.fn(),
        },
      })

      await expect(useCase.execute(input)).rejects.toThrow(AccountLockedError)
    })
  })

  describe('codigos de recuperacion', () => {
    const recoveryInput = { challengeToken: CHALLENGE, code: RECOVERY_CODE }

    it('acepta uno valido y devuelve tokens', async () => {
      const { useCase } = createDeps()

      await expect(useCase.execute(recoveryInput)).resolves.toMatchObject({ accessToken: 'acc' })
    })

    it('lo canjea por su hash, normalizado sin el guion', async () => {
      const { useCase, deps } = createDeps()

      await useCase.execute(recoveryInput)

      expect(deps.recoveryCodeRepo.consume).toHaveBeenCalledWith(USER.id, hashToken('AB2CXY7Z'))
    })

    it('no llega a mirar el TOTP', async () => {
      const { useCase, deps } = createDeps()

      await useCase.execute(recoveryInput)

      expect(deps.totp.verify).not.toHaveBeenCalled()
    })

    it('rechaza uno ya gastado', async () => {
      const { useCase } = createDeps({
        recoveryCodeRepo: {
          consume: vi.fn().mockResolvedValue(false),
          countUnused: vi.fn().mockResolvedValue(0),
          replaceAllForUser: vi.fn(),
          deleteAllForUser: vi.fn(),
        },
      })

      await expect(useCase.execute(recoveryInput)).rejects.toThrow(InvalidTwoFactorCodeError)
    })
  })

  describe('estado incoherente', () => {
    it('rechaza si el usuario ya no tiene el segundo factor activo', async () => {
      const { useCase } = createDeps({
        userRepo: {
          findById: vi.fn().mockResolvedValue({ ...USER, twoFactorEnabled: false }),
          findTwoFactorSecret: vi.fn().mockResolvedValue(ENCRYPTED),
          incrementFailedLogin: vi.fn(),
          resetFailedLogins: vi.fn(),
        },
      })

      await expect(useCase.execute(input)).rejects.toThrow(InvalidTwoFactorChallengeError)
    })

    it('rechaza si no hay secreto guardado, sin reventar', async () => {
      const { useCase } = createDeps({
        userRepo: {
          findById: vi.fn().mockResolvedValue(USER),
          findTwoFactorSecret: vi.fn().mockResolvedValue(null),
          incrementFailedLogin: vi
            .fn()
            .mockResolvedValue({ failedLoginAttempts: 1, lockedUntil: null }),
          resetFailedLogins: vi.fn(),
        },
      })

      await expect(useCase.execute(input)).rejects.toThrow(InvalidTwoFactorCodeError)
    })

    it('no revienta si el secreto guardado no se puede descifrar', async () => {
      const { useCase } = createDeps({
        cipher: {
          decrypt: vi.fn(() => {
            throw new Error('tampered')
          }),
          encrypt: vi.fn(),
        },
      })

      await expect(useCase.execute(input)).rejects.toThrow(InvalidTwoFactorCodeError)
    })
  })

  describe('no filtra el secreto', () => {
    it('ningun log lleva el secreto ni el codigo', async () => {
      const { useCase, deps } = createDeps()

      await useCase.execute(input)

      const logged = JSON.stringify(
        (['info', 'warn', 'error', 'debug'] as const).flatMap(
          (level) => (deps.logger[level] as ReturnType<typeof vi.fn>).mock.calls,
        ),
      )
      expect(logged).not.toContain(PLAIN_SECRET)
      expect(logged).not.toContain(ENCRYPTED)
      expect(logged).not.toContain(TOTP_CODE)
    })
  })
})

describe('VerifyTwoFactorUseCase — sesion recordada', () => {
  const DAY_MS = 24 * 3600 * 1000
  const NORMAL_TTL_MS = 7 * DAY_MS
  const REMEMBERED_TTL_MS = 30 * DAY_MS
  const TOLERANCE_MS = 60_000

  function createDepsWithTtls(rememberMe: boolean) {
    return createDeps({
      challengeRepo: {
        findByTokenHash: vi.fn().mockResolvedValue({ ...liveChallenge(), rememberMe }),
        markUsed: vi.fn().mockResolvedValue(undefined),
        save: vi.fn(),
        invalidateAllForUser: vi.fn(),
      },
      rememberMeRefreshTokenTtlMs: REMEMBERED_TTL_MS,
      refreshTokenTtlMs: NORMAL_TTL_MS,
    })
  }

  /** Milisegundos entre ahora y la caducidad con la que se guardo el refresh token. */
  function savedTtlMs(deps: {
    tokenStore: { saveRefreshToken: ReturnType<typeof vi.fn> }
  }): number {
    const [, , expiresAt] = deps.tokenStore.saveRefreshToken.mock.calls[0] as [
      number,
      string,
      string,
    ]
    return new Date(expiresAt).getTime() - Date.now()
  }

  it('canjear un reto recordado entrega una sesion larga', async () => {
    const { useCase, deps } = createDepsWithTtls(true)

    await useCase.execute(input)

    expect(deps.authService.generateTokens).toHaveBeenCalledWith(USER.id, true)
    expect(savedTtlMs(deps)).toBeGreaterThan(REMEMBERED_TTL_MS - TOLERANCE_MS)
  })

  it('canjear un reto normal entrega una sesion normal', async () => {
    const { useCase, deps } = createDepsWithTtls(false)

    await useCase.execute(input)

    expect(deps.authService.generateTokens).toHaveBeenCalledWith(USER.id, false)
    expect(savedTtlMs(deps)).toBeLessThan(NORMAL_TTL_MS + TOLERANCE_MS)
  })

  it('el cliente no puede alargar la sesion en el canje: manda lo que guardo el reto', async () => {
    const { useCase, deps } = createDepsWithTtls(false)

    await useCase.execute({ ...input, rememberMe: true } as unknown as typeof input)

    expect(deps.authService.generateTokens).toHaveBeenCalledWith(USER.id, false)
    expect(savedTtlMs(deps)).toBeLessThan(NORMAL_TTL_MS + TOLERANCE_MS)
  })
})
