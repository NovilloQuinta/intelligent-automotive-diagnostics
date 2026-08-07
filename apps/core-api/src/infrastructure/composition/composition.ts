import type { Application } from 'express'
import { getDb } from '@/infrastructure/persistence/sqlite/db.js'
import { createServer } from '@/infrastructure/http/server.js'
import { SqliteUserRepository } from '@/infrastructure/persistence/sqlite/userRepository.js'
import { SqliteRefreshTokenStore } from '@/infrastructure/persistence/sqlite/refreshTokenStore.js'
import { createAuthService } from '@/infrastructure/services/authService.js'
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
import { AuthController } from '@/infrastructure/http/controllers/AuthController.js'
import { DiagnosisController } from '@/infrastructure/http/controllers/DiagnosisController.js'
import { DiagnosisService } from '@/infrastructure/services/diagnosisService.js'
import type { AppConfig } from '@/infrastructure/configuration/index.js'

const ACCESS_TOKEN_TTL = '15m'
const REFRESH_TOKEN_TTL = '7d'

/** Crea el cliente LLM segun el proveedor configurado, o undefined si no hay provider. */
function createLlmClient(config: AppConfig, logger: LoggerPort): LlmClientPort | undefined {
  /** Falla con un mensaje de configuracion, no con un ZodError de "string too small". */
  function requireConfig(value: string | undefined, name: string): string {
    if (!value) throw new Error(`Missing required configuration: ${name}`)
    return value
  }

  if (config.LLM_PROVIDER === 'anthropic') {
    return createAnthropicClient({
      apiKey: requireConfig(config.ANTHROPIC_API_KEY, 'ANTHROPIC_API_KEY'),
      model: config.LLM_MODEL,
      logger,
    })
  }
  if (config.LLM_PROVIDER === 'openai') {
    return createOpenAiClient({
      apiKey: requireConfig(config.LLM_API_KEY, 'LLM_API_KEY'),
      baseURL: requireConfig(config.LLM_BASE_URL, 'LLM_BASE_URL'),
      model: requireConfig(config.LLM_MODEL, 'LLM_MODEL'),
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
}

/** Crea los repositorios SQLite y devuelve la conexion compartida. */
function createPersistenceRepositories(config: AppConfig): PersistenceRepositories {
  const db = getDb(config.DB_PATH)
  return {
    db,
    auditRepo: new SqliteAuditLogRepository(db),
    userRepo: new SqliteUserRepository(db),
    tokenStore: new SqliteRefreshTokenStore(db),
  }
}

interface AuthStack {
  readonly authService: ReturnType<typeof createAuthService>
  readonly registerUseCase: RegisterUserUseCase
  readonly loginUseCase: LoginUserUseCase
  readonly refreshUseCase: RefreshTokenUseCase
  readonly getCurrentUserUseCase: GetCurrentUserUseCase
  readonly logoutUseCase: LogoutUserUseCase
}

/** Crea el servicio de autenticacion y sus casos de uso. */
function createAuthStack(
  config: AppConfig,
  repos: Pick<PersistenceRepositories, 'userRepo' | 'tokenStore'>,
  logger: LoggerPort,
): AuthStack {
  const authService = createAuthService({
    accessTokenSecret: config.ACCESS_TOKEN_SECRET,
    refreshTokenSecret: config.REFRESH_TOKEN_SECRET,
    accessTokenExpiresIn: ACCESS_TOKEN_TTL,
    refreshTokenExpiresIn: REFRESH_TOKEN_TTL,
    tokenStore: repos.tokenStore,
  })
  return {
    authService,
    registerUseCase: new RegisterUserUseCase(repos.userRepo, authService, repos.tokenStore, logger),
    loginUseCase: new LoginUserUseCase(repos.userRepo, authService, repos.tokenStore, logger),
    refreshUseCase: new RefreshTokenUseCase(authService, logger),
    getCurrentUserUseCase: new GetCurrentUserUseCase(repos.userRepo),
    logoutUseCase: new LogoutUserUseCase(repos.tokenStore, logger),
  }
}

/** Crea el repositorio OBD del modo configurado (TCP real o simulacion). */
function createObdRepository(config: AppConfig): ObdRepository | undefined {
  if (config.OBD_MODE !== 'tcp') return undefined
  return new Elm327TcpRepository({ host: config.ELM327_HOST, port: config.ELM327_PORT })
}

/** Composition Root: cablea todas las dependencias y devuelve la app Express configurada. */
export function buildApp(config: AppConfig): Application {
  const { db, auditRepo, userRepo, tokenStore } = createPersistenceRepositories(config)
  const logger = new Logger(config.NODE_ENV, db)
  const auth = createAuthStack(config, { userRepo, tokenStore }, logger)
  const authController = new AuthController({
    registerUser: auth.registerUseCase,
    loginUser: auth.loginUseCase,
    refreshToken: auth.refreshUseCase,
    getCurrentUser: auth.getCurrentUserUseCase,
    logoutUser: auth.logoutUseCase,
  })

  const obdRepo = createObdRepository(config)
  const llmClient = createLlmClient(config, logger)
  const diagnosisService = new DiagnosisService({
    scenarios: config.OBD_MODE === 'tcp' ? [] : seedScenarios,
    obdRepo,
    llmClient,
    logger,
  })
  const diagnosisController = new DiagnosisController(diagnosisService, logger)

  return createServer({
    authController,
    diagnosisController,
    auditRepo,
    logger,
    allowedOrigins: config.ALLOWED_ORIGINS,
    nodeEnv: config.NODE_ENV,
    accessTokenSecret: config.ACCESS_TOKEN_SECRET,
  })
}
