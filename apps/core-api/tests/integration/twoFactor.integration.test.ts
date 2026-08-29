import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { generateSync } from 'otplib'
import { randomBytes } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { createServer } from '@/infrastructure/http/server.js'
import { getDb, resetDb } from '@/infrastructure/persistence/sqlite/db.js'
import { SqliteUserRepository } from '@/infrastructure/persistence/sqlite/userRepository.js'
import { SqliteRefreshTokenStore } from '@/infrastructure/persistence/sqlite/refreshTokenStore.js'
import { createAuthService } from '@/infrastructure/services/authService.js'
import { createTwoFactorStack } from '@/infrastructure/composition/twoFactor.js'
import { SqliteTwoFactorChallengeRepository } from '@/infrastructure/persistence/sqlite/twoFactorChallengeRepository.js'
import { SqliteTwoFactorRecoveryCodeRepository } from '@/infrastructure/persistence/sqlite/twoFactorRecoveryCodeRepository.js'
import { LoginUserUseCase } from '@/application/use-cases/LoginUserUseCase.js'
import { RegisterUserUseCase } from '@/application/use-cases/RegisterUserUseCase.js'
import { RefreshTokenUseCase } from '@/application/use-cases/RefreshTokenUseCase.js'
import { GetCurrentUserUseCase } from '@/application/use-cases/GetCurrentUserUseCase.js'
import { LogoutUserUseCase } from '@/application/use-cases/LogoutUserUseCase.js'
import { ForgotPasswordUseCase } from '@/application/use-cases/ForgotPasswordUseCase.js'
import { ResetPasswordUseCase } from '@/application/use-cases/ResetPasswordUseCase.js'
import { SqlitePasswordResetTokenRepository } from '@/infrastructure/persistence/sqlite/passwordResetTokenRepository.js'
import { AuthController } from '@/infrastructure/http/controllers/AuthController.js'
import { DiagnosisController } from '@/infrastructure/http/controllers/DiagnosisController.js'
import { DiagnosisService } from '@/infrastructure/services/diagnosisService.js'
import type { AuditLogRepository } from '@/application/ports/AuditLogRepository.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import type { AppConfig } from '@/infrastructure/configuration/index.js'
import type { EmailSenderPort } from '@/application/ports/EmailSenderPort.js'

const ACCESS_SECRET = 'integration-access-secret-2fa'
const PASSWORD = 'Diagnostico2026!'
const EMAIL = 'taller@example.com'

const mockAuditRepo: AuditLogRepository = {
  create: async () => {},
  list: async () => ({ items: [], total: 0 }),
  stats: async () => ({ byStatusCode: {}, byPath: {} }),
}
const mockLogger: LoggerPort = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
const noopEmail: EmailSenderPort = { send: async () => {} }

/** Config minima con lo que el segundo factor necesita. */
function testConfig(): AppConfig {
  return {
    TOTP_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    REFRESH_TOKEN_TTL: 604800,
  } as AppConfig
}

function buildApp() {
  resetDb()
  const db = getDb()
  const userRepo = new SqliteUserRepository(db)
  const tokenStore = new SqliteRefreshTokenStore(db)
  const repos = {
    userRepo,
    tokenStore,
    twoFactorChallengeRepo: new SqliteTwoFactorChallengeRepository(db),
    twoFactorRecoveryCodeRepo: new SqliteTwoFactorRecoveryCodeRepository(db),
  }
  const authService = createAuthService({
    accessTokenSecret: ACCESS_SECRET,
    refreshTokenSecret: 'integration-refresh-secret-2fa',
    accessTokenExpiresIn: 900,
    refreshTokenExpiresIn: 604800,
    tokenStore,
  })
  const config = testConfig()
  const twoFactor = createTwoFactorStack(config, repos as never, authService, mockLogger)

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
      twoFactor: {
        challengeRepo: repos.twoFactorChallengeRepo,
        challengeTtlMs: 5 * 60 * 1000,
      },
    }),
    refreshToken: new RefreshTokenUseCase(authService),
    getCurrentUser: new GetCurrentUserUseCase(userRepo),
    logoutUser: new LogoutUserUseCase(tokenStore),
    forgotPassword: new ForgotPasswordUseCase(
      userRepo,
      new SqlitePasswordResetTokenRepository(db),
      noopEmail,
      { ttlMinutes: 60, appBaseUrl: 'http://localhost:5173' },
    ),
    resetPassword: new ResetPasswordUseCase({
      tokenRepo: new SqlitePasswordResetTokenRepository(db),
      userRepo,
      authService,
      refreshTokenRepo: tokenStore,
    }),
  })

  return createServer({
    diagnosisController: new DiagnosisController(
      new DiagnosisService({ scenarios: [], logger: mockLogger }),
      mockLogger,
    ),
    authController,
    twoFactorController: twoFactor.controller,
    accessTokenSecret: ACCESS_SECRET,
    allowedOrigins: '*',
    nodeEnv: 'test',
    auditRepo: mockAuditRepo,
    logger: mockLogger,
  })
}

describe('Segundo factor — flujo completo', () => {
  let app: ReturnType<typeof createServer>

  /** Registra la cuenta y devuelve su access token. */
  async function register(): Promise<string> {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: EMAIL, username: 'taller', password: PASSWORD, userType: 'workshop' })
      .expect(201)
    return res.body.accessToken as string
  }

  /** Da de alta y activa el segundo factor. Devuelve el secreto y los codigos. */
  async function enable(token: string) {
    const setup = await request(app)
      .post('/api/profile/2fa/setup')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    const activate = await request(app)
      .post('/api/profile/2fa/activate')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: generateSync({ secret: setup.body.secret as string }) })
      .expect(200)

    return {
      secret: setup.body.secret as string,
      setupBody: setup.body as Record<string, unknown>,
      setupHeaders: setup.headers as Record<string, string>,
      recoveryCodes: activate.body.recoveryCodes as string[],
    }
  }

  beforeEach(() => {
    app = buildApp()
  })

  it('el alta devuelve QR y secreto, y NO activa nada todavia', async () => {
    const token = await register()

    const setup = await request(app)
      .post('/api/profile/2fa/setup')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(setup.body.qrDataUri).toMatch(/^data:image\/png;base64,/)
    expect(setup.body.otpauthUri).toMatch(/^otpauth:\/\/totp\//)
    expect(setup.headers['cache-control']).toBe('no-store')

    // Sigue entrando con un solo factor mientras no confirme.
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200)
    expect(login.body.accessToken).toBeDefined()
  })

  it('activar entrega diez codigos de recuperacion', async () => {
    const { recoveryCodes } = await enable(await register())

    expect(recoveryCodes).toHaveLength(10)
  })

  it('activar con un codigo incorrecto no enciende nada', async () => {
    const token = await register()
    await request(app)
      .post('/api/profile/2fa/setup')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    await request(app)
      .post('/api/profile/2fa/activate')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: '000000' })
      .expect(401)

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200)
    expect(login.body.accessToken).toBeDefined()
  })

  it('con 2FA activa, el login NO entrega tokens', async () => {
    const { secret } = await enable(await register())
    expect(secret).toBeTruthy()

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200)

    expect(login.body.twoFactorRequired).toBe(true)
    expect(login.body.challengeToken).toBeDefined()
    expect(login.body.accessToken).toBeUndefined()
    expect(login.body.refreshToken).toBeUndefined()
  })

  it('canjear el reto con el codigo de la app devuelve tokens', async () => {
    const { secret } = await enable(await register())
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200)

    const verify = await request(app)
      .post('/api/auth/2fa/verify')
      .send({ challengeToken: login.body.challengeToken, code: generateSync({ secret }) })
      .expect(200)

    expect(verify.body.accessToken).toBeDefined()
    expect(verify.body.refreshToken).toBeDefined()
  })

  it('el reto no vale dos veces', async () => {
    const { secret } = await enable(await register())
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200)

    await request(app)
      .post('/api/auth/2fa/verify')
      .send({ challengeToken: login.body.challengeToken, code: generateSync({ secret }) })
      .expect(200)

    await request(app)
      .post('/api/auth/2fa/verify')
      .send({ challengeToken: login.body.challengeToken, code: generateSync({ secret }) })
      .expect(401)
  })

  it('un reto inventado no sirve', async () => {
    await enable(await register())

    await request(app)
      .post('/api/auth/2fa/verify')
      .send({ challengeToken: 'me-lo-invento', code: '123456' })
      .expect(401)
  })

  it('un codigo de recuperacion entra, y solo una vez', async () => {
    const { recoveryCodes } = await enable(await register())
    const code = recoveryCodes[0]

    const first = await request(app)
      .post('/api/auth/login')
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200)
    await request(app)
      .post('/api/auth/2fa/verify')
      .send({ challengeToken: first.body.challengeToken, code })
      .expect(200)

    const second = await request(app)
      .post('/api/auth/login')
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200)
    await request(app)
      .post('/api/auth/2fa/verify')
      .send({ challengeToken: second.body.challengeToken, code })
      .expect(401)
  })

  it('los demas codigos de recuperacion siguen sirviendo', async () => {
    const { recoveryCodes } = await enable(await register())

    const first = await request(app)
      .post('/api/auth/login')
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200)
    await request(app)
      .post('/api/auth/2fa/verify')
      .send({ challengeToken: first.body.challengeToken, code: recoveryCodes[0] })
      .expect(200)

    const second = await request(app)
      .post('/api/auth/login')
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200)
    await request(app)
      .post('/api/auth/2fa/verify')
      .send({ challengeToken: second.body.challengeToken, code: recoveryCodes[1] })
      .expect(200)
  })

  it('desactivar exige contrasena y codigo', async () => {
    const token = await register()
    const { secret } = await enable(token)

    await request(app)
      .post('/api/profile/2fa/disable')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'OtraCosa123!', code: generateSync({ secret }) })
      .expect(401)

    await request(app)
      .post('/api/profile/2fa/disable')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: PASSWORD, code: '000000' })
      .expect(401)

    await request(app)
      .post('/api/profile/2fa/disable')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: PASSWORD, code: generateSync({ secret }) })
      .expect(200)

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200)
    expect(login.body.accessToken).toBeDefined()
  })

  it('el secreto no viaja en GET /api/auth/me', async () => {
    const token = await register()
    await enable(token)

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(JSON.stringify(me.body)).not.toMatch(/secret/i)
    expect(me.body.user?.twoFactorEnabled ?? me.body.twoFactorEnabled).toBe(true)
  })

  it('el secreto no se guarda en claro en la base', async () => {
    const { secret } = await enable(await register())

    const stored = getDb()
      .all<{ two_factor_secret: string }>(sql`SELECT two_factor_secret FROM users`)
      .map((row) => row.two_factor_secret)
      .join('')

    // La columna existe y tiene contenido, pero no es el secreto: esta cifrada.
    expect(stored).not.toBe('')
    expect(stored).not.toContain(secret)
  })
})
