import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { sql } from 'drizzle-orm'
import { getDb, resetDb } from '@/infrastructure/persistence/sqlite/db.js'
import type { DiagnosticsDb } from '@/infrastructure/persistence/sqlite/db.js'
import { createServer } from '@/infrastructure/http/server.js'
import type { AuditLogRepository } from '@/application/ports/AuditLogRepository.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import type { EmailSenderPort, EmailMessage } from '@/application/ports/EmailSenderPort.js'
import { RegisterUserUseCase } from '@/application/use-cases/RegisterUserUseCase.js'
import { LoginUserUseCase } from '@/application/use-cases/LoginUserUseCase.js'
import { RefreshTokenUseCase } from '@/application/use-cases/RefreshTokenUseCase.js'
import { GetCurrentUserUseCase } from '@/application/use-cases/GetCurrentUserUseCase.js'
import { LogoutUserUseCase } from '@/application/use-cases/LogoutUserUseCase.js'
import { ForgotPasswordUseCase } from '@/application/use-cases/ForgotPasswordUseCase.js'
import { ResetPasswordUseCase } from '@/application/use-cases/ResetPasswordUseCase.js'
import { ChangePasswordUseCase } from '@/application/use-cases/ChangePasswordUseCase.js'
import { UpdateProfileUseCase } from '@/application/use-cases/UpdateProfileUseCase.js'
import { AuthController } from '@/infrastructure/http/controllers/AuthController.js'
import { ProfileController } from '@/infrastructure/http/controllers/ProfileController.js'
import { DiagnosisController } from '@/infrastructure/http/controllers/DiagnosisController.js'
import { DiagnosisService } from '@/infrastructure/services/diagnosisService.js'
import { Email } from '@/domain/value-objects/Email.js'

const mockAuditRepo: AuditLogRepository = {
  create: async () => {},
  list: async () => ({ items: [], total: 0 }),
  stats: async () => ({ byStatusCode: {}, byPath: {} }),
}
const mockLogger: LoggerPort = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
import { SqliteUserRepository } from '@/infrastructure/persistence/sqlite/userRepository.js'
import { SqliteRefreshTokenStore } from '@/infrastructure/persistence/sqlite/refreshTokenStore.js'
import { SqlitePasswordResetTokenRepository } from '@/infrastructure/persistence/sqlite/passwordResetTokenRepository.js'
import { createAuthService } from '@/infrastructure/services/authService.js'

const ACCESS_SECRET = 'integration-access-secret'
const REFRESH_SECRET = 'integration-refresh-secret'
const APP_BASE_URL = 'http://localhost:5173'

/** Double de EmailSenderPort que captura el ultimo mensaje enviado (en vez de tocar SMTP real). */
class CapturingEmailSender implements EmailSenderPort {
  public lastMessage: EmailMessage | null = null

  async send(message: EmailMessage): Promise<void> {
    this.lastMessage = message
  }

  /** Extrae el token de reseteo del link contenido en el ultimo email enviado. */
  extractResetToken(): string {
    if (!this.lastMessage) throw new Error('No email was sent')
    const match = this.lastMessage.html.match(/token=([^"&<\s]+)/)
    if (!match) throw new Error('No reset token found in email')
    return match[1]
  }
}

describe('Auth integration', () => {
  let app: ReturnType<typeof createServer>
  let emailSender: CapturingEmailSender
  let userRepo: SqliteUserRepository
  let rawDb: DiagnosticsDb
  let authServiceForSeed: ReturnType<typeof createAuthService>

  beforeAll(() => {
    resetDb()
    const db = getDb()
    rawDb = db
    userRepo = new SqliteUserRepository(db)
    const tokenStore = new SqliteRefreshTokenStore(db)
    const passwordResetTokenRepo = new SqlitePasswordResetTokenRepository(db)
    const authService = createAuthService({
      accessTokenSecret: ACCESS_SECRET,
      refreshTokenSecret: REFRESH_SECRET,
      accessTokenExpiresIn: 900,
      refreshTokenExpiresIn: 604800,
      tokenStore,
    })
    emailSender = new CapturingEmailSender()
    authServiceForSeed = authService

    const authController = new AuthController({
      registerUser: new RegisterUserUseCase({
        userRepo,
        authService,
        tokenStore,
        refreshTokenTtlMs: 604800000,
      }),
      loginUser: new LoginUserUseCase({
        userRepo,
        authService,
        tokenStore,
        refreshTokenTtlMs: 604800000,
      }),
      refreshToken: new RefreshTokenUseCase(authService),
      getCurrentUser: new GetCurrentUserUseCase(userRepo),
      logoutUser: new LogoutUserUseCase(tokenStore),
      forgotPassword: new ForgotPasswordUseCase(userRepo, passwordResetTokenRepo, emailSender, {
        ttlMinutes: 60,
        appBaseUrl: APP_BASE_URL,
      }),
      resetPassword: new ResetPasswordUseCase({
        tokenRepo: passwordResetTokenRepo,
        userRepo,
        authService,
        refreshTokenRepo: tokenStore,
      }),
    })

    const profileController = new ProfileController(
      new ChangePasswordUseCase(userRepo, authService, tokenStore),
      new UpdateProfileUseCase(userRepo),
    )

    app = createServer({
      diagnosisController: new DiagnosisController(
        new DiagnosisService({ scenarios: [], logger: mockLogger }),
        mockLogger,
      ),
      profileController,
      rateLimit: { windowMinutes: 60, maxRequests: 1000 },
      authController,
      accessTokenSecret: ACCESS_SECRET,
      allowedOrigins: '*',
      nodeEnv: 'test',
      auditRepo: mockAuditRepo,
      logger: mockLogger,
    })
  })

  afterAll(() => {
    resetDb()
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

  describe('Bloqueo por intentos fallidos (OWASP A07)', () => {
    const LOCKED_EMAIL = 'bloqueo@test.com'
    const GOOD_PASSWORD = 'Pass1234!'

    beforeAll(async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          username: 'bloqueado',
          email: LOCKED_EMAIL,
          password: GOOD_PASSWORD,
          userType: 'individual',
        })
        .expect(201)
    })

    it('should keep answering 401 for the first four failed attempts', async () => {
      for (let attempt = 1; attempt <= 4; attempt += 1) {
        await request(app)
          .post('/api/auth/login')
          .send({ email: LOCKED_EMAIL, password: 'wrong-password' })
          .expect(401)
      }
    })

    it('should lock the account on the fifth failed attempt', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: LOCKED_EMAIL, password: 'wrong-password' })
        .expect(423)

      expect(res.body.retryAfterSeconds).toBeGreaterThan(0)
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0)
    })

    it('should reject even the correct password while the account is locked', async () => {
      // El bloqueo no sirve de nada si la contraseña correcta lo esquiva:
      // el atacante solo tendria que acertar dentro de la ventana.
      await request(app)
        .post('/api/auth/login')
        .send({ email: LOCKED_EMAIL, password: GOOD_PASSWORD })
        .expect(423)
    })

    it('should let the user in again once the lockout window has passed', async () => {
      const expired = new Date(Date.now() - 1000).toISOString()
      rawDb.run(sql`UPDATE users SET locked_until = ${expired} WHERE email = ${LOCKED_EMAIL}`)

      await request(app)
        .post('/api/auth/login')
        .send({ email: LOCKED_EMAIL, password: GOOD_PASSWORD })
        .expect(200)
    })

    it('should restart the counter after an expired lockout instead of relocking on one typo', async () => {
      const expired = new Date(Date.now() - 1000).toISOString()
      rawDb.run(
        sql`UPDATE users SET failed_login_attempts = 5, locked_until = ${expired} WHERE email = ${LOCKED_EMAIL}`,
      )

      await request(app)
        .post('/api/auth/login')
        .send({ email: LOCKED_EMAIL, password: 'wrong-password' })
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

  describe('GET /api/auth/me', () => {
    it('should return the current user without passwordHash', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'juan@test.com', password: 'Pass1234!' })
        .expect(200)

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
        .expect(200)

      expect(res.body).not.toHaveProperty('passwordHash')
      expect(res.body.id).toBeGreaterThan(0)
      expect(res.body.email).toBe('juan@test.com')
      expect(res.body.isWorkshop).toBe(false)
      expect(res.body.role).toBe('user')
      expect(res.body.isAdmin).toBe(false)
    })

    it('should return 401 without a token', async () => {
      await request(app).get('/api/auth/me').expect(401)
    })

    it('should return role "admin" for an admin user', async () => {
      const passwordHash = await authServiceForSeed.hashPassword('AdminPass123!')
      await userRepo.create({
        username: 'admin',
        email: new Email('admin@test.com'),
        passwordHash,
        userType: 'individual',
        role: 'admin',
      })

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@test.com', password: 'AdminPass123!' })
        .expect(200)

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
        .expect(200)

      expect(res.body.role).toBe('admin')
      expect(res.body.isAdmin).toBe(true)
    })
  })

  describe('POST /api/auth/logout', () => {
    it('should revoke the refresh token so refresh with the same token returns 401', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'juan@test.com', password: 'Pass1234!' })
        .expect(200)

      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .send({ refreshToken: loginRes.body.refreshToken })
        .expect(200)

      expect(logoutRes.body.success).toBe(true)

      await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: loginRes.body.refreshToken })
        .expect(401)
    })

    it('should return 400 when refreshToken is missing', async () => {
      await request(app).post('/api/auth/logout').send({}).expect(400)
    })
  })

  describe('Password reset flow', () => {
    it('full flow: forgot -> capture token -> reset -> old refresh token invalid -> login with new password', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          username: 'resetuser',
          email: 'reset@test.com',
          password: 'OldPass1!',
          userType: 'individual',
        })
        .expect(201)

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'reset@test.com', password: 'OldPass1!' })
        .expect(200)
      const oldRefreshToken = loginRes.body.refreshToken

      const forgotRes = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'reset@test.com' })
        .expect(200)
      expect(forgotRes.body.message).toBeDefined()

      const token = emailSender.extractResetToken()

      await request(app)
        .post('/api/auth/reset-password')
        .send({ token, newPassword: 'NewPass1!' })
        .expect(200)

      await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: oldRefreshToken })
        .expect(401)

      await request(app)
        .post('/api/auth/login')
        .send({ email: 'reset@test.com', password: 'OldPass1!' })
        .expect(401)

      await request(app)
        .post('/api/auth/login')
        .send({ email: 'reset@test.com', password: 'NewPass1!' })
        .expect(200)
    })

    it('should return the same generic 200 message for an existing and a non-existing email', async () => {
      const existing = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'reset@test.com' })
        .expect(200)
      const nonExisting = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'doesnotexist@test.com' })
        .expect(200)

      expect(existing.body.message).toBe(nonExisting.body.message)
    })

    it('should return 400 for an invalid token', async () => {
      await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'not-a-real-token', newPassword: 'NewPass1!' })
        .expect(400)
    })

    it('should return 400 when reusing an already-used token (single-use)', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          username: 'reuseuser',
          email: 'reuse@test.com',
          password: 'OldPass1!',
          userType: 'individual',
        })
        .expect(201)

      await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'reuse@test.com' })
        .expect(200)
      const token = emailSender.extractResetToken()

      await request(app)
        .post('/api/auth/reset-password')
        .send({ token, newPassword: 'NewPass1!' })
        .expect(200)

      await request(app)
        .post('/api/auth/reset-password')
        .send({ token, newPassword: 'AnotherPass1!' })
        .expect(400)
    })
  })

  describe('Profile flow', () => {
    it('full flow: login -> PATCH /api/profile -> change-password -> old refresh token invalid -> login with new password', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          username: 'profileflow',
          email: 'profileflow@test.com',
          password: 'OldPass1!',
          userType: 'individual',
        })
        .expect(201)

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'profileflow@test.com', password: 'OldPass1!' })
        .expect(200)
      const { accessToken, refreshToken: oldRefreshToken } = loginRes.body

      const patchRes = await request(app)
        .patch('/api/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ address: 'Nueva direccion 1' })
        .expect(200)
      expect(patchRes.body.address).toBe('Nueva direccion 1')
      expect(patchRes.body).not.toHaveProperty('passwordHash')

      await request(app)
        .patch('/api/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ username: 'juan' })
        .expect(409)

      await request(app)
        .patch('/api/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ email: 'other@test.com' })
        .expect(400)

      await request(app)
        .post('/api/profile/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: 'OldPass1!', newPassword: 'NewPass1!' })
        .expect(200)

      await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: oldRefreshToken })
        .expect(401)

      await request(app)
        .post('/api/auth/login')
        .send({ email: 'profileflow@test.com', password: 'NewPass1!' })
        .expect(200)
    })

    it('should return 401 for change-password with an incorrect current password', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'profileflow@test.com', password: 'NewPass1!' })
        .expect(200)

      await request(app)
        .post('/api/profile/change-password')
        .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
        .send({ currentPassword: 'WrongPass1!', newPassword: 'AnotherPass1!' })
        .expect(401)
    })

    it('should return 401 for PATCH /api/profile without a token', async () => {
      await request(app).patch('/api/profile').send({ address: 'x' }).expect(401)
    })
  })
})
