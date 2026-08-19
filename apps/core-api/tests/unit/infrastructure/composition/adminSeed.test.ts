import { describe, it, expect, vi } from 'vitest'
import { seedAdminUser } from '@/infrastructure/composition/auth.js'
import type { UserRepository } from '@/application/ports/UserRepository.js'
import type { AuthServicePort } from '@/application/ports/AuthServicePort.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import type { AppConfig } from '@/infrastructure/configuration/index.js'
import { User } from '@/domain/entities/User.js'
import { Email } from '@/domain/value-objects/Email.js'

function createLogger(): LoggerPort {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}

function createAuthService(): AuthServicePort {
  return {
    hashPassword: vi.fn().mockResolvedValue('$2b$12$hashed-admin-password'),
    comparePassword: vi.fn(),
    generateTokens: vi.fn(),
    verifyAccessToken: vi.fn(),
    refreshAccessToken: vi.fn(),
  }
}

function createUserRepo(existing: User | null): UserRepository {
  return {
    findByEmail: vi.fn().mockResolvedValue(existing),
    findById: vi.fn(),
    create: vi.fn().mockResolvedValue(existing),
    incrementFailedLogin: vi.fn(),
    resetFailedLogins: vi.fn(),
  }
}

function baseConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    ADMIN_EMAIL: undefined,
    ADMIN_PASSWORD: undefined,
    ...overrides,
  } as AppConfig
}

describe('seedAdminUser', () => {
  it('should create an admin user with a bcrypt hash from AuthService when none exists', async () => {
    const userRepo = createUserRepo(null)
    const authService = createAuthService()
    const logger = createLogger()
    const config = baseConfig({ ADMIN_EMAIL: 'admin@test.com', ADMIN_PASSWORD: 'Sup3rSecret!' })

    await seedAdminUser(config, userRepo, authService, logger)

    expect(authService.hashPassword).toHaveBeenCalledWith('Sup3rSecret!')
    expect(userRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: expect.objectContaining({ value: 'admin@test.com' }),
        passwordHash: '$2b$12$hashed-admin-password',
        role: 'admin',
      }),
    )
  })

  it('should not create nor overwrite when a user with that email already exists', async () => {
    const existing = new User({
      id: 1,
      username: 'admin',
      email: new Email('admin@test.com'),
      passwordHash: '$2b$12$existing-hash',
      userType: 'individual',
      role: 'admin',
      createdAt: '2024-01-01T00:00:00Z',
    })
    const userRepo = createUserRepo(existing)
    const authService = createAuthService()
    const logger = createLogger()
    const config = baseConfig({ ADMIN_EMAIL: 'admin@test.com', ADMIN_PASSWORD: 'Sup3rSecret!' })

    await seedAdminUser(config, userRepo, authService, logger)

    expect(userRepo.create).not.toHaveBeenCalled()
    expect(authService.hashPassword).not.toHaveBeenCalled()
  })

  it('should not throw and should warn when ADMIN_EMAIL/ADMIN_PASSWORD are not configured', async () => {
    const userRepo = createUserRepo(null)
    const authService = createAuthService()
    const logger = createLogger()
    const config = baseConfig()

    await expect(seedAdminUser(config, userRepo, authService, logger)).resolves.not.toThrow()

    expect(userRepo.create).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledTimes(1)
  })

  it('should never log the admin password', async () => {
    const userRepo = createUserRepo(null)
    const authService = createAuthService()
    const logger = createLogger()
    const config = baseConfig({ ADMIN_EMAIL: 'admin@test.com', ADMIN_PASSWORD: 'Sup3rSecret!' })

    await seedAdminUser(config, userRepo, authService, logger)

    const allLogCalls = [
      ...vi.mocked(logger.debug).mock.calls,
      ...vi.mocked(logger.info).mock.calls,
      ...vi.mocked(logger.warn).mock.calls,
      ...vi.mocked(logger.error).mock.calls,
    ]
    const serialized = JSON.stringify(allLogCalls)
    expect(serialized).not.toContain('Sup3rSecret!')
  })
})
