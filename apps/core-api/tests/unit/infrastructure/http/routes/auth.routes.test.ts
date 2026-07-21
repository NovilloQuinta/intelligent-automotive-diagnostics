import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import { createAuthRoutes } from '@/infrastructure/http/routes/auth.routes.js'
import type { UserRepository } from '@/application/ports/userRepository.interface.js'
import type { AuthServicePort } from '@/application/ports/authService.interface.js'
import type { RefreshTokenStorePort } from '@/application/ports/refreshTokenStore.interface.js'

function createTestApp(
  overrides: {
    userRepo?: Partial<UserRepository>
    authService?: Partial<AuthServicePort>
    tokenStore?: Partial<RefreshTokenStorePort>
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

  const tokenStore: RefreshTokenStorePort = {
    saveRefreshToken: vi.fn().mockResolvedValue(undefined),
    findRefreshToken: vi.fn().mockResolvedValue(null),
    revokeRefreshToken: vi.fn().mockResolvedValue(undefined),
    ...overrides.tokenStore,
  }

  const app = express()
  app.use(express.json())
  app.use('/api/auth', createAuthRoutes(userRepo, authService, tokenStore))
  return { app, userRepo, authService, tokenStore }
}

describe('authRoutes', () => {
  describe('POST /api/auth/register', () => {
    it('should register an individual user and return tokens', async () => {
      const { app, userRepo, authService, tokenStore } = createTestApp()

      const res = await request(app).post('/api/auth/register').send({
        username: 'juan',
        email: 'juan@mail.com',
        password: 'Pass1234!',
        userType: 'individual',
      })

      expect(res.status).toBe(201)
      expect(res.body.accessToken).toBe('access-token-xyz')
      expect(res.body.refreshToken).toBe('refresh-token-xyz')
      expect(userRepo.create).toHaveBeenCalled()
      expect(authService.generateTokens).toHaveBeenCalledWith(1)
      expect(tokenStore.saveRefreshToken).toHaveBeenCalled()
    })

    it('should return 409 when email is duplicated', async () => {
      const { app } = createTestApp({
        userRepo: {
          findByEmail: vi.fn().mockResolvedValue({
            id: 1,
            username: 'existing',
            email: 'juan@mail.com',
            passwordHash: 'hash',
            userType: 'individual',
            createdAt: '2024-01-01T00:00:00Z',
          }),
        },
      })

      const res = await request(app).post('/api/auth/register').send({
        username: 'juan',
        email: 'juan@mail.com',
        password: 'Pass1234!',
        userType: 'individual',
      })

      expect(res.status).toBe(409)
    })

    it('should return 400 when validation fails', async () => {
      const { app } = createTestApp()

      const res = await request(app).post('/api/auth/register').send({ username: 'x' })

      expect(res.status).toBe(400)
    })
  })

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials and return tokens', async () => {
      const { app } = createTestApp({
        userRepo: {
          findByEmail: vi.fn().mockResolvedValue({
            id: 1,
            username: 'juan',
            email: 'juan@mail.com',
            passwordHash: '$2b$12$hashed',
            userType: 'individual',
            createdAt: '2024-01-01T00:00:00Z',
          }),
        },
      })

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'juan@mail.com', password: 'Pass1234!' })

      expect(res.status).toBe(200)
      expect(res.body.accessToken).toBe('access-token-xyz')
      expect(res.body.refreshToken).toBe('refresh-token-xyz')
    })

    it('should return 401 with wrong password', async () => {
      const { app } = createTestApp({
        userRepo: {
          findByEmail: vi.fn().mockResolvedValue({
            id: 1,
            username: 'juan',
            email: 'juan@mail.com',
            passwordHash: '$2b$12$hashed',
            userType: 'individual',
            createdAt: '2024-01-01T00:00:00Z',
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
        .send({ email: 'noexiste@mail.com', password: 'x' })

      expect(res.status).toBe(401)
    })

    it('should return 400 when validation fails', async () => {
      const { app } = createTestApp()

      const res = await request(app).post('/api/auth/login').send({})

      expect(res.status).toBe(400)
    })
  })

  describe('POST /api/auth/refresh', () => {
    it('should refresh with valid token and return new pair', async () => {
      const { app } = createTestApp()

      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'valid-refresh-token' })

      expect(res.status).toBe(200)
      expect(res.body.accessToken).toBe('new-access-token')
      expect(res.body.refreshToken).toBe('new-refresh-token')
    })

    it('should return 401 when refresh token is invalid', async () => {
      const { app } = createTestApp({
        authService: {
          refreshAccessToken: vi.fn().mockRejectedValue(new Error('Refresh token not found')),
        },
      })

      const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'bad-token' })

      expect(res.status).toBe(401)
    })

    it('should return 400 when validation fails', async () => {
      const { app } = createTestApp()

      const res = await request(app).post('/api/auth/refresh').send({})

      expect(res.status).toBe(400)
    })
  })
})
