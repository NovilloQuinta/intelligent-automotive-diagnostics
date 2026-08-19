import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  UpdateProfileUseCase,
  UsernameAlreadyTakenError,
} from '@/application/use-cases/UpdateProfileUseCase.js'
import { UserNotFoundError } from '@/application/use-cases/GetCurrentUserUseCase.js'
import type { UserRepository } from '@/application/ports/UserRepository.js'
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

function createMocks(overrides: Partial<UserRepository> = {}) {
  const userRepo: UserRepository = {
    findByEmail: vi.fn().mockResolvedValue(USER),
    findById: vi.fn().mockResolvedValue(USER),
    create: vi.fn().mockResolvedValue(USER),
    incrementFailedLogin: vi.fn().mockResolvedValue({ failedLoginAttempts: 1, lockedUntil: null }),
    resetFailedLogins: vi.fn().mockResolvedValue(undefined),
    updatePassword: vi.fn().mockResolvedValue(undefined),
    updateProfile: vi.fn().mockResolvedValue({ ...USER, username: 'nuevo' }),
    existsByUsername: vi.fn().mockResolvedValue(false),
    ...overrides,
  }
  return { userRepo }
}

describe('UpdateProfileUseCase', () => {
  let mocks: ReturnType<typeof createMocks>
  let useCase: UpdateProfileUseCase

  beforeEach(() => {
    mocks = createMocks()
    useCase = new UpdateProfileUseCase(mocks.userRepo)
  })

  it('deberia actualizar parcialmente el perfil y devolver el usuario sin passwordHash', async () => {
    const result = await useCase.execute(1, { username: 'nuevo' })

    expect(mocks.userRepo.existsByUsername).toHaveBeenCalledWith('nuevo', 1)
    expect(mocks.userRepo.updateProfile).toHaveBeenCalledWith(1, { username: 'nuevo' })
    expect(result).not.toHaveProperty('passwordHash')
    expect(result.username).toBe('nuevo')
  })

  it('deberia lanzar UsernameAlreadyTakenError si el username ya existe (otro usuario)', async () => {
    mocks = createMocks({ existsByUsername: vi.fn().mockResolvedValue(true) })
    useCase = new UpdateProfileUseCase(mocks.userRepo)

    await expect(useCase.execute(1, { username: 'tomado' })).rejects.toBeInstanceOf(
      UsernameAlreadyTakenError,
    )
    expect(mocks.userRepo.updateProfile).not.toHaveBeenCalled()
  })

  it('no deberia lanzar si el username es el mismo que el propio', async () => {
    mocks = createMocks({ existsByUsername: vi.fn().mockResolvedValue(false) })
    useCase = new UpdateProfileUseCase(mocks.userRepo)

    await expect(useCase.execute(1, { username: 'juan' })).resolves.toBeDefined()
    expect(mocks.userRepo.existsByUsername).toHaveBeenCalledWith('juan', 1)
  })

  it('deberia permitir body vacio (no-op)', async () => {
    await expect(useCase.execute(1, {})).resolves.toBeDefined()
    expect(mocks.userRepo.existsByUsername).not.toHaveBeenCalled()
    expect(mocks.userRepo.updateProfile).toHaveBeenCalledWith(1, {})
  })

  it('deberia rechazar un input que incluya email', async () => {
    await expect(
      useCase.execute(1, { email: 'nuevo@mail.com' } as unknown as { username?: string }),
    ).rejects.toThrow()
  })

  it('deberia lanzar UserNotFoundError si el usuario no existe', async () => {
    mocks = createMocks({ findById: vi.fn().mockResolvedValue(null) })
    useCase = new UpdateProfileUseCase(mocks.userRepo)

    await expect(useCase.execute(999, { username: 'quiensea' })).rejects.toBeInstanceOf(
      UserNotFoundError,
    )
  })
})
