import { describe, it, expect, vi } from 'vitest'
import {
  SetupTwoFactorUseCase,
  TwoFactorAlreadyEnabledError,
} from '@/application/use-cases/SetupTwoFactorUseCase.js'
import {
  ActivateTwoFactorUseCase,
  TwoFactorSetupMissingError,
} from '@/application/use-cases/ActivateTwoFactorUseCase.js'
import { DisableTwoFactorUseCase } from '@/application/use-cases/DisableTwoFactorUseCase.js'
import { InvalidTwoFactorCodeError } from '@/application/use-cases/VerifyTwoFactorUseCase.js'
import { RECOVERY_CODE_COUNT } from '@/domain/twoFactor.js'
import { hashToken } from '@/application/shared/hashToken.js'
import type { User } from '@/domain/entities/User.js'
import { Email } from '@/domain/value-objects/Email.js'

const PLAIN_SECRET = 'JBSWY3DPEHPK3PXP'
const ENCRYPTED = 'cifrado'

const user = (overrides: Partial<User> = {}) =>
  ({
    id: 7,
    username: 'juan',
    email: new Email('juan@mail.com'),
    passwordHash: '$2b$12$hashed',
    userType: 'individual',
    createdAt: '2026-01-01T00:00:00Z',
    failedLoginAttempts: 0,
    lockedUntil: null,
    twoFactorEnabled: false,
    ...overrides,
  }) as User

function baseDeps(overrides: Record<string, unknown> = {}) {
  return {
    userRepo: {
      findById: vi.fn().mockResolvedValue(user()),
      findTwoFactorSecret: vi.fn().mockResolvedValue(ENCRYPTED),
      saveTwoFactorSecret: vi.fn().mockResolvedValue(undefined),
      setTwoFactorEnabled: vi.fn().mockResolvedValue(undefined),
    },
    recoveryCodeRepo: {
      replaceAllForUser: vi.fn().mockResolvedValue(undefined),
      consume: vi.fn().mockResolvedValue(true),
      countUnused: vi.fn().mockResolvedValue(10),
      deleteAllForUser: vi.fn().mockResolvedValue(undefined),
    },
    totp: {
      generateSecret: vi.fn().mockReturnValue(PLAIN_SECRET),
      verify: vi.fn().mockReturnValue(true),
      toQrDataUri: vi.fn().mockResolvedValue('data:image/png;base64,AAA'),
    },
    cipher: {
      encrypt: vi.fn().mockReturnValue(ENCRYPTED),
      decrypt: vi.fn().mockReturnValue(PLAIN_SECRET),
    },
    issuer: 'IAD',
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ...overrides,
  }
}

describe('SetupTwoFactorUseCase', () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const make = (o: Record<string, unknown> = {}) => {
    const deps = baseDeps(o)
    return { deps, useCase: new SetupTwoFactorUseCase(deps as any) }
  }

  it('devuelve la URI otpauth y el QR listo para un <img>', async () => {
    const { useCase } = make()

    const result = await useCase.execute(7)

    expect(result.otpauthUri).toMatch(/^otpauth:\/\/totp\//)
    expect(result.qrDataUri).toMatch(/^data:image\/png;base64,/)
  })

  it('devuelve tambien el secreto en claro, para quien no puede escanear', async () => {
    const { useCase } = make()

    expect((await useCase.execute(7)).secret).toBe(PLAIN_SECRET)
  })

  it('guarda el secreto cifrado, nunca en claro', async () => {
    const { useCase, deps } = make()

    await useCase.execute(7)

    expect(deps.cipher.encrypt).toHaveBeenCalledWith(PLAIN_SECRET)
    expect(deps.userRepo.saveTwoFactorSecret).toHaveBeenCalledWith(7, ENCRYPTED)
  })

  it('NO activa el segundo factor todavia', async () => {
    const { useCase, deps } = make()

    await useCase.execute(7)

    expect(deps.userRepo.setTwoFactorEnabled).not.toHaveBeenCalled()
  })

  it('rechaza rehacer el alta si ya esta activo', async () => {
    // Regenerar el secreto de quien ya lo tiene activo lo dejaria fuera al instante.
    const { useCase } = make({
      userRepo: {
        findById: vi.fn().mockResolvedValue(user({ twoFactorEnabled: true })),
        saveTwoFactorSecret: vi.fn(),
        setTwoFactorEnabled: vi.fn(),
        findTwoFactorSecret: vi.fn(),
      },
    })

    await expect(useCase.execute(7)).rejects.toThrow(TwoFactorAlreadyEnabledError)
  })
})

describe('ActivateTwoFactorUseCase', () => {
  const make = (o: Record<string, unknown> = {}) => {
    const deps = baseDeps(o)
    return { deps, useCase: new ActivateTwoFactorUseCase(deps as any) }
  }

  it('activa el segundo factor con un codigo valido', async () => {
    const { useCase, deps } = make()

    await useCase.execute(7, '123456')

    expect(deps.userRepo.setTwoFactorEnabled).toHaveBeenCalledWith(7, true)
  })

  it('entrega los diez codigos de recuperacion', async () => {
    const { useCase } = make()

    const result = await useCase.execute(7, '123456')

    expect(result.recoveryCodes).toHaveLength(RECOVERY_CODE_COUNT)
  })

  it('guarda solo los hashes de esos codigos', async () => {
    const { useCase, deps } = make()

    const { recoveryCodes } = await useCase.execute(7, '123456')

    const [, hashes] = deps.recoveryCodeRepo.replaceAllForUser.mock.calls[0] as [number, string[]]
    expect(hashes).toEqual(recoveryCodes.map((code) => hashToken(code.replace('-', ''))))
    expect(hashes).not.toContain(recoveryCodes[0])
  })

  it('no activa nada si el codigo es incorrecto', async () => {
    const { useCase, deps } = make({
      totp: {
        verify: vi.fn().mockReturnValue(false),
        generateSecret: vi.fn(),
        toQrDataUri: vi.fn(),
      },
    })

    await expect(useCase.execute(7, '000000')).rejects.toThrow(InvalidTwoFactorCodeError)
    expect(deps.userRepo.setTwoFactorEnabled).not.toHaveBeenCalled()
    expect(deps.recoveryCodeRepo.replaceAllForUser).not.toHaveBeenCalled()
  })

  it('falla si no se preparo el alta antes', async () => {
    const { useCase } = make({
      userRepo: {
        findById: vi.fn().mockResolvedValue(user()),
        findTwoFactorSecret: vi.fn().mockResolvedValue(null),
        saveTwoFactorSecret: vi.fn(),
        setTwoFactorEnabled: vi.fn(),
      },
    })

    await expect(useCase.execute(7, '123456')).rejects.toThrow(TwoFactorSetupMissingError)
  })
})

describe('DisableTwoFactorUseCase', () => {
  const make = (o: Record<string, unknown> = {}) => {
    const deps = {
      ...baseDeps(o),
      authService: { comparePassword: vi.fn().mockResolvedValue(true) },
      ...o,
    }
    deps.userRepo = {
      ...baseDeps().userRepo,
      findById: vi.fn().mockResolvedValue(user({ twoFactorEnabled: true })),
      ...((o.userRepo as object) ?? {}),
    } as never
    return { deps, useCase: new DisableTwoFactorUseCase(deps as any) }
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const input = { userId: 7, password: 'Password1!', code: '123456' }

  it('desactiva el segundo factor con contrasena y codigo validos', async () => {
    const { useCase, deps } = make()

    await useCase.execute(input)

    expect(deps.userRepo.setTwoFactorEnabled).toHaveBeenCalledWith(7, false)
  })

  it('borra el secreto', async () => {
    const { useCase, deps } = make()

    await useCase.execute(input)

    expect(deps.userRepo.saveTwoFactorSecret).toHaveBeenCalledWith(7, null)
  })

  it('borra los codigos de recuperacion', async () => {
    const { useCase, deps } = make()

    await useCase.execute(input)

    expect(deps.recoveryCodeRepo.deleteAllForUser).toHaveBeenCalledWith(7)
  })

  it('no basta con la contrasena: exige tambien el codigo', async () => {
    const { useCase, deps } = make({
      totp: {
        verify: vi.fn().mockReturnValue(false),
        generateSecret: vi.fn(),
        toQrDataUri: vi.fn(),
      },
      recoveryCodeRepo: {
        consume: vi.fn().mockResolvedValue(false),
        replaceAllForUser: vi.fn(),
        countUnused: vi.fn(),
        deleteAllForUser: vi.fn(),
      },
    })

    await expect(useCase.execute(input)).rejects.toThrow(InvalidTwoFactorCodeError)
    expect(deps.userRepo.setTwoFactorEnabled).not.toHaveBeenCalled()
  })

  it('no basta con el codigo: un access token robado no desactiva nada', async () => {
    const { useCase, deps } = make({
      authService: { comparePassword: vi.fn().mockResolvedValue(false) },
    })

    await expect(useCase.execute(input)).rejects.toThrow()
    expect(deps.userRepo.setTwoFactorEnabled).not.toHaveBeenCalled()
  })

  it('acepta un codigo de recuperacion, para quien perdio el movil', async () => {
    const { useCase, deps } = make()

    await useCase.execute({ ...input, code: 'AB2C-XY7Z' })

    expect(deps.recoveryCodeRepo.consume).toHaveBeenCalledWith(7, hashToken('AB2CXY7Z'))
    expect(deps.userRepo.setTwoFactorEnabled).toHaveBeenCalledWith(7, false)
  })
})
