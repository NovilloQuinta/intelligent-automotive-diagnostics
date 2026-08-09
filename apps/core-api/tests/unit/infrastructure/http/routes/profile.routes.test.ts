import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import jwt from 'jsonwebtoken'
import { createProfileRoutes } from '@/infrastructure/http/routes/profile.routes.js'
import { ChangePasswordUseCase } from '@/application/use-cases/ChangePasswordUseCase.js'
import { UpdateProfileUseCase } from '@/application/use-cases/UpdateProfileUseCase.js'
import { ProfileController } from '@/infrastructure/http/controllers/ProfileController.js'
import { createAuthMiddleware } from '@/infrastructure/http/middleware/auth.middleware.js'
import type { UserRepository } from '@/application/ports/UserRepository.js'
import type { AuthServicePort } from '@/application/ports/AuthServicePort.js'
import type { RefreshTokenRepository } from '@/application/ports/RefreshTokenRepository.js'
import type { User } from '@/domain/entities/user.js'
import { Email } from '@/domain/value-objects/email.js'

const SECRET = 'profile-test-secret'

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
    tokenStore?: Partial<RefreshTokenRepository>
  } = {},
) {
  const userRepo: UserRepository = {
    findByEmail: vi.fn().mockResolvedValue(USER),
    findById: vi.fn().mockResolvedValue(USER),
    create: vi.fn().mockResolvedValue(USER),
    incrementFailedLogin: vi.fn().mockResolvedValue(undefined),
    resetFailedLogins: vi.fn().mockResolvedValue(undefined),
    updatePassword: vi.fn().mockResolvedValue(undefined),
    updateProfile: vi.fn().mockResolvedValue({ ...USER, username: 'renamed' }),
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

  const tokenStore: RefreshTokenRepository = {
    saveRefreshToken: vi.fn().mockResolvedValue(undefined),
    findRefreshToken: vi.fn().mockResolvedValue(null),
    revokeRefreshToken: vi.fn().mockResolvedValue(undefined),
    revokeAllForUser: vi.fn().mockResolvedValue(undefined),
    ...overrides.tokenStore,
  }

  return { userRepo, authService, tokenStore }
}

function createTestApp(
  overrides: {
    userRepo?: Partial<UserRepository>
    authService?: Partial<AuthServicePort>
    tokenStore?: Partial<RefreshTokenRepository>
  } = {},
) {
  const { userRepo, authService, tokenStore } = createMocks(overrides)

  const changePasswordUseCase = new ChangePasswordUseCase(userRepo, authService, tokenStore)
  const updateProfileUseCase = new UpdateProfileUseCase(userRepo)
  const controller = new ProfileController(changePasswordUseCase, updateProfileUseCase)

  const app = express()
  app.use(express.json())
  const requireAuth = createAuthMiddleware(SECRET)
  app.use('/api/profile', requireAuth, createProfileRoutes(controller))

  return { app, userRepo, authService, tokenStore }
}

function bearerToken(userId = 1): string {
  return `Bearer ${jwt.sign({ sub: userId }, SECRET, { expiresIn: '15m' })}`
}

describe('profileRoutes', () => {
  describe('PATCH /api/profile', () => {
    it('should update the profile and return 200', async () => {
      const { app } = createTestApp()

      const res = await request(app)
        .patch('/api/profile')
        .set('Authorization', bearerToken())
        .send({ username: 'renamed' })

      expect(res.status).toBe(200)
      expect(res.body.username).toBe('renamed')
      expect(res.body).not.toHaveProperty('passwordHash')
    })

    it('should return 409 when the username is already taken', async () => {
      const { app } = createTestApp({
        userRepo: { existsByUsername: vi.fn().mockResolvedValue(true) },
      })

      const res = await request(app)
        .patch('/api/profile')
        .set('Authorization', bearerToken())
        .send({ username: 'tomado' })

      expect(res.status).toBe(409)
    })

    it('should return 400 when the body includes email', async () => {
      const { app } = createTestApp()

      const res = await request(app)
        .patch('/api/profile')
        .set('Authorization', bearerToken())
        .send({ email: 'nuevo@mail.com' })

      expect(res.status).toBe(400)
    })

    it('should return 401 without a token', async () => {
      const { app } = createTestApp()

      const res = await request(app).patch('/api/profile').send({ username: 'x' })

      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/profile/change-password', () => {
    it('should change the password and return 200', async () => {
      const { app, tokenStore } = createTestApp()

      const res = await request(app)
        .post('/api/profile/change-password')
        .set('Authorization', bearerToken())
        .send({ currentPassword: 'OldPass1!', newPassword: 'NewPass1!' })

      expect(res.status).toBe(200)
      expect(tokenStore.revokeAllForUser).toHaveBeenCalledWith(1)
    })

    it('should return 401 when the current password is incorrect', async () => {
      const { app } = createTestApp({
        authService: { comparePassword: vi.fn().mockResolvedValue(false) },
      })

      const res = await request(app)
        .post('/api/profile/change-password')
        .set('Authorization', bearerToken())
        .send({ currentPassword: 'Wrong1!', newPassword: 'NewPass1!' })

      expect(res.status).toBe(401)
    })

    it('should return 400 when the new password is weak', async () => {
      const { app } = createTestApp()

      const res = await request(app)
        .post('/api/profile/change-password')
        .set('Authorization', bearerToken())
        .send({ currentPassword: 'OldPass1!', newPassword: 'weak' })

      expect(res.status).toBe(400)
    })

    it('should return 401 without a token', async () => {
      const { app } = createTestApp()

      const res = await request(app)
        .post('/api/profile/change-password')
        .send({ currentPassword: 'OldPass1!', newPassword: 'NewPass1!' })

      expect(res.status).toBe(401)
    })
  })
})
