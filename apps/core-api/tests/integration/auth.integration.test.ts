import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { createServer } from '@/infrastructure/http/server.js'
import type { AuditLogRepository } from '@/application/ports/AuditLogRepository.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'

const mockAuditRepo: AuditLogRepository = { create: async () => {} }
const mockLogger: LoggerPort = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
import { SqliteUserRepository } from '@/infrastructure/persistence/sqlite/userRepository.js'
import { SqliteRefreshTokenStore } from '@/infrastructure/persistence/sqlite/refreshTokenStore.js'
import { createAuthService } from '@/infrastructure/services/authService.js'

const ACCESS_SECRET = 'integration-access-secret'
const REFRESH_SECRET = 'integration-refresh-secret'

describe('Auth integration', () => {
  let app: ReturnType<typeof createServer>

  beforeAll(() => {
    const sqlite = new Database(':memory:')
    sqlite.pragma('foreign_keys = ON')

    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        user_type TEXT NOT NULL,
        business_name TEXT,
        tax_id TEXT,
        address TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        revoked_at TEXT
      );
    `)

    const db = drizzle(sqlite)
    const userRepo = new SqliteUserRepository(db)
    const tokenStore = new SqliteRefreshTokenStore(db)
    const authService = createAuthService({
      accessTokenSecret: ACCESS_SECRET,
      refreshTokenSecret: REFRESH_SECRET,
      accessTokenExpiresIn: '15m',
      refreshTokenExpiresIn: '7d',
      tokenStore,
    })

    app = createServer({
      scenarios: [],
      rateLimit: { windowMinutes: 60, maxRequests: 1000 },
      userRepo,
      authService,
      tokenStore,
      accessTokenSecret: ACCESS_SECRET,
      allowedOrigins: '*',
      nodeEnv: 'test',
      auditRepo: mockAuditRepo,
      logger: mockLogger,
    })
  })

  describe('POST /api/auth/register', () => {
    it('should register an individual user and return 201 with tokens', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'juan',
          email: 'juan@test.com',
          password: 'Pass1234!',
          userType: 'individual',
        })
        .expect(201)

      expect(res.body.user).toBeDefined()
      expect(res.body.user.id).toBeGreaterThan(0)
      expect(res.body.user.userType).toBe('individual')
      expect(res.body.accessToken).toBeDefined()
      expect(res.body.refreshToken).toBeDefined()
    })

    it('should register a workshop with business fields', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'taller1',
          email: 'taller@test.com',
          password: 'Pass1234!',
          userType: 'workshop',
          businessName: 'Talleres AutoFix',
          taxId: 'B12345678',
          address: 'Calle 123',
        })
        .expect(201)

      expect(res.body.user.userType).toBe('workshop')
      expect(res.body.user.businessName).toBe('Talleres AutoFix')
    })

    it('should return 409 for duplicate email', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'other',
          email: 'juan@test.com',
          password: 'Pass1234!',
          userType: 'individual',
        })
        .expect(409)

      expect(res.body.error).toContain('Email already registered')
    })

    it('should return 400 for invalid input', async () => {
      const res = await request(app).post('/api/auth/register').send({ username: 'x' }).expect(400)

      expect(res.body.error).toBe('Validation failed')
    })
  })

  describe('POST /api/auth/login', () => {
    it('should return 200 with tokens for valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'juan@test.com', password: 'Pass1234!' })
        .expect(200)

      expect(res.body.accessToken).toBeDefined()
      expect(res.body.refreshToken).toBeDefined()
    })

    it('should return 401 for wrong password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'juan@test.com', password: 'wrongpass' })
        .expect(401)

      expect(res.body.error).toBe('Invalid credentials')
    })

    it('should return 401 for unknown email', async () => {
      await request(app)
        .post('/api/auth/login')
        .send({ email: 'noexiste@test.com', password: 'Pass1234!' })
        .expect(401)
    })
  })

  describe('POST /api/auth/refresh', () => {
    it('should return 200 with new tokens for valid refresh token', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'juan@test.com', password: 'Pass1234!' })

      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: loginRes.body.refreshToken })
        .expect(200)

      expect(res.body.accessToken).toBeDefined()
      expect(res.body.refreshToken).toBeDefined()
    })

    it('should return 401 for invalid refresh token', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'not-a-valid-token' })
        .expect(401)

      expect(res.body.error).toBe('Invalid refresh token')
    })
  })

  describe('Protected routes', () => {
    let accessToken: string

    it('should get token from login', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'juan@test.com', password: 'Pass1234!' })
        .expect(200)

      accessToken = res.body.accessToken
    })

    it('should return 401 when accessing protected route without token', async () => {
      // GET /api/scenarios requires auth
      await request(app).get('/api/scenarios').expect(401)
    })

    it('should return 200 when accessing protected route with valid token', async () => {
      const res = await request(app)
        .get('/api/scenarios')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)

      expect(Array.isArray(res.body.scenarios)).toBe(true)
    })
  })
})
