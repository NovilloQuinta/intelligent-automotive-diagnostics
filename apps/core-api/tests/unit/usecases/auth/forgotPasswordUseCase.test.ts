import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ForgotPasswordUseCase } from '@/application/use-cases/ForgotPasswordUseCase.js'
import type { UserRepository } from '@/application/ports/UserRepository.js'
import type { PasswordResetTokenRepository } from '@/application/ports/PasswordResetTokenRepository.js'
import type { EmailSenderPort } from '@/application/ports/EmailSenderPort.js'
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
    tokenRepo?: Partial<PasswordResetTokenRepository>
    emailSender?: Partial<EmailSenderPort>
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
    findByTokenHash: vi.fn().mockResolvedValue(null),
    markUsed: vi.fn().mockResolvedValue(undefined),
    invalidateAllForUser: vi.fn().mockResolvedValue(undefined),
    ...overrides.tokenRepo,
  }

  const emailSender: EmailSenderPort = {
    send: vi.fn().mockResolvedValue(undefined),
    ...overrides.emailSender,
  }

  return { userRepo, tokenRepo, emailSender }
}

describe('ForgotPasswordUseCase', () => {
  let mocks: ReturnType<typeof createMocks>
  let useCase: ForgotPasswordUseCase

  beforeEach(() => {
    mocks = createMocks()
    useCase = new ForgotPasswordUseCase(mocks.userRepo, mocks.tokenRepo, mocks.emailSender, {
      ttlMinutes: 60,
      appBaseUrl: 'http://localhost:5173',
    })
  })

  it('deberia invalidar tokens previos, guardar uno nuevo hasheado y enviar el email', async () => {
    await useCase.execute({ email: 'juan@mail.com' })

    expect(mocks.tokenRepo.invalidateAllForUser).toHaveBeenCalledWith(1)
    expect(mocks.tokenRepo.save).toHaveBeenCalledTimes(1)
    const [userId, tokenHash, expiresAt] = (mocks.tokenRepo.save as ReturnType<typeof vi.fn>).mock
      .calls[0]
    expect(userId).toBe(1)
    expect(typeof tokenHash).toBe('string')
    expect(tokenHash).not.toBe('')
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now())

    expect(mocks.emailSender.send).toHaveBeenCalledTimes(1)
    const [message] = (mocks.emailSender.send as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(message.to).toBe('juan@mail.com')
    expect(message.html).toContain('http://localhost:5173/reset-password?token=')
  })

  it('el token enviado por email no coincide con el hash persistido', async () => {
    await useCase.execute({ email: 'juan@mail.com' })

    const [, tokenHash] = (mocks.tokenRepo.save as ReturnType<typeof vi.fn>).mock.calls[0]
    const [message] = (mocks.emailSender.send as ReturnType<typeof vi.fn>).mock.calls[0]
    const sentToken = new URL(message.html.match(/http\S+/)[0]).searchParams.get('token')

    expect(sentToken).not.toBe(tokenHash)
  })

  it('deberia resolver sin lanzar aunque el email no exista (anti-enumeracion)', async () => {
    mocks = createMocks({ userRepo: { findByEmail: vi.fn().mockResolvedValue(null) } })
    useCase = new ForgotPasswordUseCase(mocks.userRepo, mocks.tokenRepo, mocks.emailSender, {
      ttlMinutes: 60,
      appBaseUrl: 'http://localhost:5173',
    })

    await expect(useCase.execute({ email: 'noexiste@mail.com' })).resolves.toBeUndefined()
    expect(mocks.tokenRepo.save).not.toHaveBeenCalled()
    expect(mocks.emailSender.send).not.toHaveBeenCalled()
  })

  it('deberia resolver sin lanzar aunque el envio de email falle', async () => {
    mocks = createMocks({
      emailSender: { send: vi.fn().mockRejectedValue(new Error('SMTP down')) },
    })
    useCase = new ForgotPasswordUseCase(mocks.userRepo, mocks.tokenRepo, mocks.emailSender, {
      ttlMinutes: 60,
      appBaseUrl: 'http://localhost:5173',
    })

    await expect(useCase.execute({ email: 'juan@mail.com' })).resolves.toBeUndefined()
  })

  it('deberia lanzar ZodError si el email es invalido', async () => {
    await expect(useCase.execute({ email: 'not-an-email' })).rejects.toThrow()
  })
})
