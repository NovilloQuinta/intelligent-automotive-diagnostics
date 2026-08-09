import type { Application } from 'express'
import { getDb } from '@/infrastructure/persistence/sqlite/db.js'
import { createServer } from '@/infrastructure/http/server.js'
import { SqliteUserRepository } from '@/infrastructure/persistence/sqlite/userRepository.js'
import { SqliteRefreshTokenStore } from '@/infrastructure/persistence/sqlite/refreshTokenStore.js'
import { SqlitePasswordResetTokenRepository } from '@/infrastructure/persistence/sqlite/passwordResetTokenRepository.js'
import { createAuthService } from '@/infrastructure/services/authService.js'
import { createNodemailerEmailSender } from '@/infrastructure/email/nodemailerEmailSender.js'
import { createConsoleEmailSender } from '@/infrastructure/email/consoleEmailSender.js'
import type { EmailSenderPort } from '@/application/ports/EmailSenderPort.js'
import { Elm327TcpRepository } from '@/infrastructure/elm327/elm327Adapter.js'
import type { ObdRepository } from '@/application/ports/ObdRepository.js'
import { createAnthropicClient } from '@/infrastructure/llm/anthropicClient.js'
import { createOpenAiClient } from '@/infrastructure/llm/openAiClient.js'
import type { LlmClientPort } from '@/application/ports/LlmClientPort.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import { SqliteAuditLogRepository } from '@/infrastructure/persistence/sqlite/auditLogRepository.js'
import { Logger } from '@/infrastructure/observability/logger.js'
import { seedScenarios } from '@/infrastructure/simulation/seedScenarios.js'
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
import type { AppConfig } from '@/infrastructure/configuration/index.js'

/** Crea el cliente LLM segun el proveedor configurado, o undefined si no hay provider. */
function createLlmClient(config: AppConfig, logger: LoggerPort): LlmClientPort | undefined {
  if (config.LLM_PROVIDER === 'anthropic') {
    return createAnthropicClient({
      apiKey: config.ANTHROPIC_API_KEY ?? '',
      model: config.LLM_MODEL,
      logger,
    })
  }
  if (config.LLM_PROVIDER === 'openai') {
    return createOpenAiClient({
      apiKey: config.LLM_API_KEY ?? '',
      baseURL: config.LLM_BASE_URL ?? '',
      model: config.LLM_MODEL ?? '',
      logger,
    })
  }
  return undefined
}

interface PersistenceRepositories {
  readonly db: ReturnType<typeof getDb>
  readonly auditRepo: SqliteAuditLogRepository
  readonly userRepo: SqliteUserRepository
  readonly tokenStore: SqliteRefreshTokenStore
  readonly passwordResetTokenRepo: SqlitePasswordResetTokenRepository
}

/** Crea los repositorios SQLite y devuelve la conexion compartida. */
function createPersistenceRepositories(config: AppConfig): PersistenceRepositories {
  const db = getDb(config.DB_PATH)
  return {
    db,
    auditRepo: new SqliteAuditLogRepository(db),
    userRepo: new SqliteUserRepository(db),
    tokenStore: new SqliteRefreshTokenStore(db),
    passwordResetTokenRepo: new SqlitePasswordResetTokenRepository(db),
  }
}

/**
 * Crea el adapter de envio de email segun la configuracion: nodemailer real via SMTP
 * si hay `SMTP_HOST` configurado, o el fallback de consola en dev/CI.
 */
function createEmailSender(config: AppConfig, logger: LoggerPort): EmailSenderPort {
  if (config.SMTP_HOST) {
    return createNodemailerEmailSender({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      user: config.SMTP_USER,
      pass: config.SMTP_PASS,
      from: config.SMTP_FROM,
    })
  }
  return createConsoleEmailSender(logger)
}

interface AuthStack {
  readonly authService: ReturnType<typeof createAuthService>
  readonly registerUseCase: RegisterUserUseCase
  readonly loginUseCase: LoginUserUseCase
  readonly refreshUseCase: RefreshTokenUseCase
  readonly getCurrentUserUseCase: GetCurrentUserUseCase
  readonly logoutUseCase: LogoutUserUseCase
  readonly forgotPasswordUseCase: ForgotPasswordUseCase
  readonly resetPasswordUseCase: ResetPasswordUseCase
}

/** Crea el servicio de autenticacion y sus casos de uso. */
function createAuthStack(
  config: AppConfig,
  repos: Pick<PersistenceRepositories, 'userRepo' | 'tokenStore' | 'passwordResetTokenRepo'>,
  emailSender: EmailSenderPort,
  logger: LoggerPort,
): AuthStack {
  const authService = createAuthService({
    accessTokenSecret: config.ACCESS_TOKEN_SECRET,
    refreshTokenSecret: config.REFRESH_TOKEN_SECRET,
    accessTokenExpiresIn: '15m',
    refreshTokenExpiresIn: '7d',
    tokenStore: repos.tokenStore,
  })
  return {
    authService,
    registerUseCase: new RegisterUserUseCase(repos.userRepo, authService, repos.tokenStore, logger),
    loginUseCase: new LoginUserUseCase(repos.userRepo, authService, repos.tokenStore, logger),
    refreshUseCase: new RefreshTokenUseCase(authService, logger),
    getCurrentUserUseCase: new GetCurrentUserUseCase(repos.userRepo),
    logoutUseCase: new LogoutUserUseCase(repos.tokenStore, logger),
    forgotPasswordUseCase: new ForgotPasswordUseCase(
      repos.userRepo,
      repos.passwordResetTokenRepo,
      emailSender,
      { ttlMinutes: config.PASSWORD_RESET_TTL_MINUTES, appBaseUrl: config.APP_BASE_URL },
      logger,
    ),
    resetPasswordUseCase: new ResetPasswordUseCase(
      repos.passwordResetTokenRepo,
      repos.userRepo,
      authService,
      repos.tokenStore,
      logger,
    ),
  }
}

interface ProfileStack {
  readonly changePasswordUseCase: ChangePasswordUseCase
  readonly updateProfileUseCase: UpdateProfileUseCase
  readonly profileController: ProfileController
}

/** Crea los casos de uso y el controlador de perfil autenticado. */
function createProfileStack(
  repos: Pick<PersistenceRepositories, 'userRepo' | 'tokenStore'>,
  authService: ReturnType<typeof createAuthService>,
  logger: LoggerPort,
): ProfileStack {
  const changePasswordUseCase = new ChangePasswordUseCase(
    repos.userRepo,
    authService,
    repos.tokenStore,
    logger,
  )
  const updateProfileUseCase = new UpdateProfileUseCase(repos.userRepo, logger)
  return {
    changePasswordUseCase,
    updateProfileUseCase,
    profileController: new ProfileController(changePasswordUseCase, updateProfileUseCase),
  }
}

/** Crea el repositorio OBD del modo configurado (TCP real o simulacion). */
function createObdRepository(config: AppConfig): ObdRepository | undefined {
  if (config.OBD_MODE !== 'tcp') return undefined
  return new Elm327TcpRepository({ host: config.ELM327_HOST, port: config.ELM327_PORT })
}

/** Composition Root: cablea todas las dependencias y devuelve la app Express configurada. */
export function buildApp(config: AppConfig): Application {
  const { db, auditRepo, userRepo, tokenStore, passwordResetTokenRepo } =
    createPersistenceRepositories(config)
  const logger = new Logger(config.NODE_ENV, db)
  const emailSender = createEmailSender(config, logger)
  const auth = createAuthStack(
    config,
    { userRepo, tokenStore, passwordResetTokenRepo },
    emailSender,
    logger,
  )
  const authController = new AuthController(
    auth.registerUseCase,
    auth.loginUseCase,
    auth.refreshUseCase,
    auth.getCurrentUserUseCase,
    auth.logoutUseCase,
    auth.forgotPasswordUseCase,
    auth.resetPasswordUseCase,
  )

  const profile = createProfileStack({ userRepo, tokenStore }, auth.authService, logger)

  const obdRepo = createObdRepository(config)
  const llmClient = createLlmClient(config, logger)
  const diagnosisService = new DiagnosisService(
    config.OBD_MODE === 'tcp' ? [] : seedScenarios,
    obdRepo,
    llmClient,
    logger,
  )
  const diagnosisController = new DiagnosisController(diagnosisService, logger)

  return createServer({
    authController,
    diagnosisController,
    profileController: profile.profileController,
    auditRepo,
    logger,
    allowedOrigins: config.ALLOWED_ORIGINS,
    nodeEnv: config.NODE_ENV,
    accessTokenSecret: config.ACCESS_TOKEN_SECRET,
  })
}
