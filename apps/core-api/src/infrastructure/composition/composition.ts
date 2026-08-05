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
import { SqliteAuditLogRepository } from '@/infrastructure/persistence/sqlite/auditLogRepository.js'
import { Logger } from '@/infrastructure/observability/logger.js'
import { seedScenarios } from '@/infrastructure/simulation/seedScenarios.js'
import { RegisterUserUseCase } from '@/application/use-cases/RegisterUserUseCase.js'
import { LoginUserUseCase } from '@/application/use-cases/LoginUserUseCase.js'
import { RefreshTokenUseCase } from '@/application/use-cases/RefreshTokenUseCase.js'
import { GetCurrentUserUseCase } from '@/application/use-cases/GetCurrentUserUseCase.js'
import { LogoutUserUseCase } from '@/application/use-cases/LogoutUserUseCase.js'
import { AuthController } from '@/infrastructure/http/controllers/AuthController.js'
import type { AppConfig } from '@/infrastructure/configuration/index.js'

/** Composition Root: cablea todas las dependencias y devuelve la app Express configurada. */
export function buildApp(config: AppConfig): Application {
  const db = getDb(config.DB_PATH)

  // ── Repositorios ──
  const auditRepo = new SqliteAuditLogRepository(db)
  const logger = new Logger(config.NODE_ENV, db)
  const userRepo = new SqliteUserRepository(db)
  const tokenStore = new SqliteRefreshTokenStore(db)

  // ── Servicios ──
  const authService = createAuthService({
    accessTokenSecret: config.ACCESS_TOKEN_SECRET,
    refreshTokenSecret: config.REFRESH_TOKEN_SECRET,
    accessTokenExpiresIn: '15m',
    refreshTokenExpiresIn: '7d',
    tokenStore,
  })

  // ── Use cases de auth ──
  const registerUseCase = new RegisterUserUseCase(userRepo, authService, tokenStore)
  const loginUseCase = new LoginUserUseCase(userRepo, authService, tokenStore)
  const refreshUseCase = new RefreshTokenUseCase(authService)
  const getCurrentUserUseCase = new GetCurrentUserUseCase(userRepo)
  const logoutUseCase = new LogoutUserUseCase(tokenStore)

  // ── Controladores ──
  const authController = new AuthController(
    registerUseCase,
    loginUseCase,
    refreshUseCase,
    getCurrentUserUseCase,
    logoutUseCase,
  )

  // ── OBD ──
  const obdRepo: ObdRepository | undefined =
    config.OBD_MODE === 'tcp'
      ? new Elm327TcpRepository({ host: config.ELM327_HOST, port: config.ELM327_PORT })
      : undefined

  // ── LLM ──
  let llmClient: LlmClientPort | undefined
  if (config.LLM_PROVIDER === 'anthropic') {
    llmClient = createAnthropicClient({
      apiKey: config.ANTHROPIC_API_KEY ?? '',
      model: config.LLM_MODEL,
    })
  } else if (config.LLM_PROVIDER === 'openai') {
    llmClient = createOpenAiClient({
      apiKey: config.LLM_API_KEY ?? '',
      baseURL: config.LLM_BASE_URL ?? '',
      model: config.LLM_MODEL ?? '',
    })
  }

  // ── Servidor ──
  return createServer({
    scenarios: config.OBD_MODE === 'tcp' ? [] : seedScenarios,
    obdRepo,
    llmClient,
    authController,
    auditRepo,
    logger,
    allowedOrigins: config.ALLOWED_ORIGINS,
    nodeEnv: config.NODE_ENV,
    accessTokenSecret: config.ACCESS_TOKEN_SECRET,
  })
}
