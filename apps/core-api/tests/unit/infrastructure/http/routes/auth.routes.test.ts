import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import jwt from 'jsonwebtoken'
import { createAuthRoutes } from '@/infrastructure/http/routes/auth.routes.js'
import { RegisterUserUseCase } from '@/application/use-cases/RegisterUserUseCase.js'
import { LoginUserUseCase } from '@/application/use-cases/LoginUserUseCase.js'
import { RefreshTokenUseCase } from '@/application/use-cases/RefreshTokenUseCase.js'
import { GetCurrentUserUseCase } from '@/application/use-cases/GetCurrentUserUseCase.js'
import { LogoutUserUseCase } from '@/application/use-cases/LogoutUserUseCase.js'
import { ForgotPasswordUseCase } from '@/application/use-cases/ForgotPasswordUseCase.js'
import { ResetPasswordUseCase } from '@/application/use-cases/ResetPasswordUseCase.js'
import { AuthController } from '@/infrastructure/http/controllers/AuthController.js'
import { createAuthMiddleware } from '@/infrastructure/http/middleware/auth.middleware.js'
import { hashToken } from '@/application/shared/hashToken.js'
import type { UserRepository } from '@/application/ports/UserRepository.js'
import type { AuthServicePort } from '@/application/ports/AuthServicePort.js'
import type { RefreshTokenRepository } from '@/application/ports/RefreshTokenRepository.js'
import type { PasswordResetTokenRepository } from '@/application/ports/PasswordResetTokenRepository.js'
import type { EmailSenderPort } from '@/application/ports/EmailSenderPort.js'

function createMocks(
  overrides: {
    userRepo?: Partial<UserRepository>
    authService?: Partial<AuthServicePort>
    tokenStore?: Partial<RefreshTokenRepository>
    tokenRepo?: Partial<PasswordResetTokenRepository>
    emailSender?: Partial<EmailSenderPort>
  } = {},
) {
  const userRepo: UserRepository = {
    findByEmail: vi.fn().mockResolvedValue(null),
    findById: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({
      id: 1,
      username: 'juan',
      email: 'juan@mail.com',
      passwordHash: '$2b$12$hashed',
      userType: 'individual',
      businessName: null,
      taxId: null,
      address: null,
      createdAt: '2024-01-01T00:00:00Z',
    }),
    incrementFailedLogin: vi.fn().mockResolvedValue(undefined),
    resetFailedLogins: vi.fn().mockResolvedValue(undefined),
    updatePassword: vi.fn().mockResolvedValue(undefined),
    updateProfile: vi.fn().mockResolvedValue(undefined),
    existsByUsername: vi.fn().mockResolvedValue(false),
    ...overrides.userRepo,
  }

  const authService: AuthServicePort = {
    hashPassword: vi.fn().mockResolvedValue('$2b$12$hashed'),
    comparePassword: vi.fn().mockResolvedValue(true),
    generateTokens: vi.fn().mockReturnValue({
      accessToken: 'access-token-xyz',
      refreshToken: 'refresh-token-xyz',
    }),
    verifyAccessToken: vi.fn().mockReturnValue(42),
    refreshAccessToken: vi.fn().mockResolvedValue({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    }),
    ...overrides.authService,
  }

  const tokenStore: RefreshTokenRepository = {
    saveRefreshToken: vi.fn().mockResolvedValue(undefined),
    findRefreshToken: vi.fn().mockResolvedValue(null),
    revokeRefreshToken: vi.fn().mockResolvedValue(undefined),
    revokeAllForUser: vi.fn().mockResolvedValue(undefined),
    ...overrides.tokenStore,
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

  return { userRepo, authService, tokenStore, tokenRepo, emailSender }
}

function createTestApp(
  overrides: {
    userRepo?: Partial<UserRepository>
    authService?: Partial<AuthServicePort>
    tokenStore?: Partial<RefreshTokenRepository>
    tokenRepo?: Partial<PasswordResetTokenRepository>
    emailSender?: Partial<EmailSenderPort>
    accessTokenSecret?: string
  } = {},
) {
  const { userRepo, authService, tokenStore, tokenRepo, emailSender } = createMocks(overrides)

  const registerUseCase = new RegisterUserUseCase(userRepo, authService, tokenStore)
  const loginUseCase = new LoginUserUseCase(userRepo, authService, tokenStore)
  const refreshUseCase = new RefreshTokenUseCase(authService)
  const getCurrentUserUseCase = new GetCurrentUserUseCase(userRepo)
  const logoutUseCase = new LogoutUserUseCase(tokenStore)
  const forgotPasswordUseCase = new ForgotPasswordUseCase(userRepo, tokenRepo, emailSender, {
    ttlMinutes: 60,
    appBaseUrl: 'http://localhost:5173',
  })
  const resetPasswordUseCase = new ResetPasswordUseCase(
    tokenRepo,
    userRepo,
    authService,
    tokenStore,
  )
  const controller = new AuthController({
    registerUser: registerUseCase,
    loginUser: loginUseCase,
    refreshToken: refreshUseCase,
    getCurrentUser: getCurrentUserUseCase,
    logoutUser: logoutUseCase,
    forgotPassword: forgotPasswordUseCase,
    resetPassword: resetPasswordUseCase,
  })

  const app = express()
  app.use(express.json())
  const requireAuth = overrides.accessTokenSecret
    ? createAuthMiddleware(overrides.accessTokenSecret)
    : undefined
  app.use('/api/auth', createAuthRoutes(controller, requireAuth))

  return { app, userRepo, authService, tokenStore, tokenRepo, emailSender }
}

describe('authRoutes', () => {
  describe('POST /api/auth/register', () => {
    it('should register an individual user and return tokens', async () => {
      const { app, userRepo } = createTestApp()
      const res = await request(app).post('/api/auth/register').send({
        username: 'juan',
        email: 'juan@mail.com',
        password: 'Password1!',
        userType: 'individual',
      })

      expect(res.status).toBe(201)
      expect(res.body.accessToken).toBeDefined()
      expect(res.body.refreshToken).toBeDefined()
      expect(res.body.user).toBeDefined()
      expect(userRepo.create).toHaveBeenCalled()
    })

    it('should return 409 when email is duplicated', async () => {
      const { app } = createTestApp({
        userRepo: { findByEmail: vi.fn().mockResolvedValue({ id: 1 }) },
      })
      const res = await request(app).post('/api/auth/register').send({
        username: 'juan',
        email: 'juan@mail.com',
        password: 'Password1!',
        userType: 'individual',
      })

      expect(res.status).toBe(409)
    })

    it('should return 400 when validation fails', async () => {
      const { app } = createTestApp()
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: '', email: 'invalid', password: '123' })

      expect(res.status).toBe(400)
    })
  })

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials and return tokens', async () => {
      const { app } = createTestApp({
        userRepo: {
          findByEmail: vi.fn().mockResolvedValue({
            id: 1,
            passwordHash: '$2b$12$hashed',
          }),
        },
      })
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'juan@mail.com', password: 'Password1!' })

      expect(res.status).toBe(200)
      expect(res.body.accessToken).toBeDefined()
    })

    it('should return 401 with wrong password', async () => {
      const { app } = createTestApp({
        userRepo: {
          findByEmail: vi.fn().mockResolvedValue({
            id: 1,
            passwordHash: '$2b$12$hashed',
          }),
        },
        authService: { comparePassword: vi.fn().mockResolvedValue(false) },
      })
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'juan@mail.com', password: 'wrong' })

      expect(res.status).toBe(401)
    })

    it('should return 423 when the account is locked out', async () => {
      const lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString()
      const { app } = createTestApp({
        userRepo: {
          findByEmail: vi.fn().mockResolvedValue({
            id: 1,
            passwordHash: '$2b$12$hashed',
            lockedUntil,
          }),
        },
      })
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'juan@mail.com', password: 'whatever' })

      // Sin rama propia, AccountLockedError caia en el 500 generico: el bloqueo
      // por intentos fallidos se reportaba como error del servidor.
      expect(res.status).toBe(423)
    })

    it('should return 401 when email is not found', async () => {
      const { app } = createTestApp()
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'noexiste@mail.com', password: 'Password1!' })

      expect(res.status).toBe(401)
    })

    it('should return 400 when validation fails', async () => {
      const { app } = createTestApp()
      const res = await request(app).post('/api/auth/login').send({ email: 'invalid' })

      expect(res.status).toBe(400)
    })
  })

  describe('POST /api/auth/refresh', () => {
    it('should refresh with valid token and return new pair', async () => {
      const { app } = createTestApp()
      const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'valid-token' })

      expect(res.status).toBe(200)
      expect(res.body.accessToken).toBeDefined()
    })

    it('should return 401 when refresh token is invalid', async () => {
      const { app } = createTestApp({
        authService: { refreshAccessToken: vi.fn().mockRejectedValue(new Error('Invalid token')) },
      })
      const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'invalid' })

      expect(res.status).toBe(401)
    })

    it('should return 400 when validation fails', async () => {
      const { app } = createTestApp()
      const res = await request(app).post('/api/auth/refresh').send({})

      expect(res.status).toBe(400)
    })
  })

  describe('GET /api/auth/me', () => {
    const secret = 'test-secret'

    it('should return the current user without passwordHash for a valid Bearer token', async () => {
      const { app } = createTestApp({
        accessTokenSecret: secret,
        userRepo: {
          findById: vi.fn().mockResolvedValue({
            id: 1,
            username: 'juan',
            email: 'juan@mail.com',
            passwordHash: '$2b$12$hashed',
            userType: 'individual',
            businessName: null,
            taxId: null,
            address: null,
            createdAt: '2024-01-01T00:00:00Z',
          }),
        },
      })
      const token = jwt.sign({ sub: 1 }, secret, { expiresIn: '15m' })

      const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body).not.toHaveProperty('passwordHash')
      expect(res.body.id).toBe(1)
      expect(res.body.username).toBe('juan')
      expect(res.body.email).toBe('juan@mail.com')
    })

    it('should return 401 when no token is provided', async () => {
      const { app } = createTestApp({ accessTokenSecret: secret })

      const res = await request(app).get('/api/auth/me')

      expect(res.status).toBe(401)
    })

    it('should return 401 for an invalid token', async () => {
      const { app } = createTestApp({ accessTokenSecret: secret })

      const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer invalid')

      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/auth/logout', () => {
    it('should revoke the refresh token and return 200', async () => {
      const { app, tokenStore } = createTestApp()

      const res = await request(app)
        .post('/api/auth/logout')
        .send({ refreshToken: 'refresh-token-xyz' })

      expect(res.status).toBe(200)
      expect(tokenStore.revokeRefreshToken).toHaveBeenCalledWith(hashToken('refresh-token-xyz'))
    })

    it('should return 400 when refreshToken is missing', async () => {
      const { app } = createTestApp()

      const res = await request(app).post('/api/auth/logout').send({})

      expect(res.status).toBe(400)
    })

    it('should return 401 when refreshing with the same token after logout', async () => {
      const revokedHashes = new Set<string>()
      const { app } = createTestApp({
        tokenStore: {
          revokeRefreshToken: vi.fn().mockImplementation(async (hash: string) => {
            revokedHashes.add(hash)
          }),
        },
        authService: {
          refreshAccessToken: vi.fn().mockImplementation(async (token: string) => {
            if (revokedHashes.has(hashToken(token))) {
              throw new Error('Refresh token revoked')
            }
            return { accessToken: 'new-access-token', refreshToken: 'new-refresh-token' }
          }),
        },
      })

      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .send({ refreshToken: 'refresh-token-xyz' })
      expect(logoutRes.status).toBe(200)

      const refreshRes = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'refresh-token-xyz' })
      expect(refreshRes.status).toBe(401)
    })
  })

  describe('POST /api/auth/forgot-password', () => {
    it('should always return 200 with a generic message when the email exists', async () => {
      const { app, tokenRepo, emailSender } = createTestApp({
        userRepo: {
          findByEmail: vi.fn().mockResolvedValue({
            id: 1,
            username: 'juan',
            email: 'juan@mail.com',
            passwordHash: '$2b$12$hashed',
            userType: 'individual',
          }),
        },
      })

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'juan@mail.com' })

      expect(res.status).toBe(200)
      expect(res.body.message).toBeDefined()
      expect(tokenRepo.save).toHaveBeenCalled()
      expect(emailSender.send).toHaveBeenCalled()
    })

    it('should always return 200 with the same generic message when the email does not exist', async () => {
      const { app, tokenRepo } = createTestApp()

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'noexiste@mail.com' })

      expect(res.status).toBe(200)
      expect(res.body.message).toBeDefined()
      expect(tokenRepo.save).not.toHaveBeenCalled()
    })

    it('should return 400 when validation fails', async () => {
      const { app } = createTestApp()

      const res = await request(app).post('/api/auth/forgot-password').send({ email: 'invalid' })

      expect(res.status).toBe(400)
    })
  })

  describe('POST /api/auth/reset-password', () => {
    it('should return 200 and reset the password for a valid token', async () => {
      const { app } = createTestApp({
        tokenRepo: {
          findByTokenHash: vi.fn().mockResolvedValue({
            id: 1,
            userId: 1,
            tokenHash: hashToken('valid-reset-token'),
            expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            createdAt: new Date().toISOString(),
            usedAt: null,
          }),
        },
      })

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'valid-reset-token', newPassword: 'NewPass1!' })

      expect(res.status).toBe(200)
    })

    it('should return 400 for an invalid or expired token', async () => {
      const { app } = createTestApp({
        tokenRepo: { findByTokenHash: vi.fn().mockResolvedValue(null) },
      })

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'bad-token', newPassword: 'NewPass1!' })

      expect(res.status).toBe(400)
    })

    it('should return 400 when the new password is weak', async () => {
      const { app } = createTestApp()

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'some-token', newPassword: 'weak' })

      expect(res.status).toBe(400)
    })
  })
})
