import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import { createAuthRoutes } from '@/infrastructure/http/routes/auth.routes.js'
import { RegisterUserUseCase } from '@/application/use-cases/RegisterUserUseCase.js'
import { LoginUserUseCase } from '@/application/use-cases/LoginUserUseCase.js'
import { RefreshTokenUseCase } from '@/application/use-cases/RefreshTokenUseCase.js'
import { AuthController } from '@/infrastructure/http/controllers/AuthController.js'
import type { UserRepository } from '@/application/ports/UserRepository.js'
import type { AuthServicePort } from '@/application/ports/AuthServicePort.js'
import type { RefreshTokenRepository } from '@/application/ports/RefreshTokenRepository.js'

function createMocks(overrides: {
  userRepo?: Partial<UserRepository>
  authService?: Partial<AuthServicePort>
  tokenStore?: Partial<RefreshTokenRepository>
} = {}) {
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
    ...overrides.tokenStore,
  }

  return { userRepo, authService, tokenStore }
}

function createTestApp(overrides: {
  userRepo?: Partial<UserRepository>
  authService?: Partial<AuthServicePort>
  tokenStore?: Partial<RefreshTokenRepository>
} = {}) {
  const { userRepo, authService, tokenStore } = createMocks(overrides)

  const registerUseCase = new RegisterUserUseCase(userRepo, authService, tokenStore)
  const loginUseCase = new LoginUserUseCase(userRepo, authService, tokenStore)
  const refreshUseCase = new RefreshTokenUseCase(authService)
  const controller = new AuthController(registerUseCase, loginUseCase, refreshUseCase)

  const app = express()
  app.use(express.json())
  app.use('/api/auth', createAuthRoutes(controller))

  return { app, userRepo, authService, tokenStore }
}

describe('authRoutes', () => {
  describe('POST /api/auth/register', () => {
    it('should register an individual user and return tokens', async () => {
      const { app, userRepo } = createTestApp()
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'juan', email: 'juan@mail.com', password: 'password123', userType: 'individual' })

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
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'juan', email: 'juan@mail.com', password: 'password123', userType: 'individual' })

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
        .send({ email: 'juan@mail.com', password: 'password123' })

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

    it('should return 401 when email is not found', async () => {
      const { app } = createTestApp()
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'noexiste@mail.com', password: 'password123' })

      expect(res.status).toBe(401)
    })

    it('should return 400 when validation fails', async () => {
      const { app } = createTestApp()
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'invalid' })

      expect(res.status).toBe(400)
    })
  })

  describe('POST /api/auth/refresh', () => {
    it('should refresh with valid token and return new pair', async () => {
      const { app } = createTestApp()
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'valid-token' })

      expect(res.status).toBe(200)
      expect(res.body.accessToken).toBeDefined()
    })

    it('should return 401 when refresh token is invalid', async () => {
      const { app } = createTestApp({
        authService: { refreshAccessToken: vi.fn().mockRejectedValue(new Error('Invalid token')) },
      })
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid' })

      expect(res.status).toBe(401)
    })

    it('should return 400 when validation fails', async () => {
      const { app } = createTestApp()
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({})

      expect(res.status).toBe(400)
    })
  })
})
