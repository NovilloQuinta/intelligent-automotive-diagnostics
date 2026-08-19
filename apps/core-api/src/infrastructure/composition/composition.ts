import type { Application } from 'express'
import { createDiagnosisService } from '@/infrastructure/composition/obd.js'
import { getDb } from '@/infrastructure/persistence/sqlite/db.js'
import { createServer } from '@/infrastructure/http/server.js'
import { SqliteUserRepository } from '@/infrastructure/persistence/sqlite/userRepository.js'
import { SqliteRefreshTokenStore } from '@/infrastructure/persistence/sqlite/refreshTokenStore.js'
import { SqlitePasswordResetTokenRepository } from '@/infrastructure/persistence/sqlite/passwordResetTokenRepository.js'
import { SqliteVehicleRepository } from '@/infrastructure/persistence/sqlite/vehicleRepository.js'
import { seedManufacturerCatalog } from '@/infrastructure/persistence/sqlite/seedManufacturerCatalog.js'
import { createAuthService } from '@/infrastructure/services/authService.js'
import { createNodemailerEmailSender } from '@/infrastructure/email/nodemailerEmailSender.js'
import { createConsoleEmailSender } from '@/infrastructure/email/consoleEmailSender.js'
import type { EmailSenderPort } from '@/application/ports/EmailSenderPort.js'
import { createAnthropicClient } from '@/infrastructure/llm/anthropicClient.js'
import { createOpenAiClient } from '@/infrastructure/llm/openAiClient.js'
import type { LlmClientPort } from '@/application/ports/LlmClientPort.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import { SqliteAuditLogRepository } from '@/infrastructure/persistence/sqlite/auditLogRepository.js'
import { SqliteLogRepository } from '@/infrastructure/persistence/sqlite/logRepository.js'
import { createRequireAdmin } from '@/infrastructure/http/middleware/admin.middleware.js'
import { AdminController } from '@/infrastructure/http/controllers/AdminController.js'
import { GetAdminOverviewUseCase } from '@/application/use-cases/admin/GetAdminOverviewUseCase.js'
import { ListSystemLogsUseCase } from '@/application/use-cases/admin/ListSystemLogsUseCase.js'
import { ListAuditLogsUseCase } from '@/application/use-cases/admin/ListAuditLogsUseCase.js'
import { ListUsersUseCase } from '@/application/use-cases/admin/ListUsersUseCase.js'
import { GetKnowledgeStatsUseCase } from '@/application/use-cases/admin/GetKnowledgeStatsUseCase.js'
import { Logger } from '@/infrastructure/observability/logger.js'
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
import type { VectorStore } from '@/application/ports/VectorStore.js'
import type { AppConfig } from '@/infrastructure/configuration/index.js'
import type { UserRepository } from '@/application/ports/UserRepository.js'
import type { AuthServicePort } from '@/application/ports/AuthServicePort.js'
import { Email } from '@/domain/value-objects/email.js'
import { initLanceDb } from '@/infrastructure/persistence/vector/lancedb.js'
import { createLanceVectorStore } from '@/infrastructure/persistence/vector/lanceVectorStore.js'
import { createEmbedding } from '@/infrastructure/persistence/vector/embedding.js'
import {
  PIDS_TABLE_CONFIG,
  DTCS_TABLE_CONFIG,
  DIAGNOSES_TABLE_CONFIG,
  ECUS_TABLE_CONFIG,
} from '@/infrastructure/persistence/vector/vectorTableConfigs.js'
import { createKnowledgeIndex } from '@/application/knowledge/createKnowledgeIndex.js'
import { toPidMetadata, toPidEntry } from '@/application/knowledge/pidKnowledgeMapper.js'
import { toDtcMetadata, toDtcEntry } from '@/application/knowledge/dtcKnowledgeMapper.js'
import {
  toDiagnosisMetadata,
  toDiagnosisEntry,
} from '@/application/knowledge/diagnosisKnowledgeMapper.js'
import { toEcuMetadata, toEcuEntry } from '@/application/knowledge/ecuKnowledgeMapper.js'
import type { EmbeddingGenerator } from '@/application/ports/EmbeddingGenerator.js'
import type { KnowledgeStack } from '@/application/ports/KnowledgeStack.js'
import type { KnowledgeVectorStores } from '@/application/use-cases/admin/GetKnowledgeStatsUseCase.js'
import type { WebSearchPort } from '@/application/ports/WebSearchPort.js'
import { createSerpApiClient } from '@/infrastructure/web-search/serpApiClient.js'

/** Falla con un mensaje de configuracion, no con un ZodError de "string too small". */
function requireConfig(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Missing required configuration: ${name}`)
  return value
}

/** Crea el cliente LLM segun el proveedor configurado, o undefined si no hay provider. */
function createLlmClient(config: AppConfig, logger: LoggerPort): LlmClientPort | undefined {
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
  readonly passwordResetTokenRepo: SqlitePasswordResetTokenRepository
  readonly logRepo: SqliteLogRepository
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
    logRepo: new SqliteLogRepository(db),
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
// eslint-disable-next-line max-lines-per-function -- lista declarativa de casos de uso
function createAuthStack(
  config: AppConfig,
  repos: Pick<PersistenceRepositories, 'userRepo' | 'tokenStore' | 'passwordResetTokenRepo'>,
  emailSender: EmailSenderPort,
  logger: LoggerPort,
): AuthStack {
  const authService = createAuthService({
    accessTokenSecret: config.ACCESS_TOKEN_SECRET,
    refreshTokenSecret: config.REFRESH_TOKEN_SECRET,
    accessTokenExpiresIn: config.ACCESS_TOKEN_TTL,
    refreshTokenExpiresIn: config.REFRESH_TOKEN_TTL,
    tokenStore: repos.tokenStore,
  })
  const refreshTokenTtlMs = config.REFRESH_TOKEN_TTL * 1000
  return {
    authService,
    registerUseCase: new RegisterUserUseCase(
      repos.userRepo,
      authService,
      repos.tokenStore,
      refreshTokenTtlMs,
      logger,
    ),
    loginUseCase: new LoginUserUseCase(
      repos.userRepo,
      authService,
      repos.tokenStore,
      refreshTokenTtlMs,
      logger,
    ),
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

/**
 * Crea el primer administrador desde `ADMIN_EMAIL`/`ADMIN_PASSWORD` si no existe ya.
 *
 * Idempotente: si ya hay un usuario con ese email no se crea uno nuevo ni se
 * sobrescribe su contraseña (puede haber sido cambiada a mano). Reusa el
 * hashing de {@link AuthServicePort} para no introducir un segundo camino de
 * bcrypt. Sin las variables de entorno, no falla el arranque: solo avisa.
 *
 * La contraseña nunca se pasa a `logger`, ni siquiera en el warning.
 */
export async function seedAdminUser(
  config: AppConfig,
  userRepo: UserRepository,
  authService: AuthServicePort,
  logger: LoggerPort,
): Promise<void> {
  if (!config.ADMIN_EMAIL || !config.ADMIN_PASSWORD) {
    logger.warn('Admin seed skipped: ADMIN_EMAIL/ADMIN_PASSWORD not configured')
    return
  }

  const existing = await userRepo.findByEmail(config.ADMIN_EMAIL)
  if (existing) {
    return
  }

  const passwordHash = await authService.hashPassword(config.ADMIN_PASSWORD)
  await userRepo.create({
    username: 'admin',
    email: new Email(config.ADMIN_EMAIL),
    passwordHash,
    userType: 'individual',
    role: 'admin',
  })

  logger.info('Admin user seeded', { email: config.ADMIN_EMAIL })
}

/**
 * {@link KnowledgeStack} ampliado con los tres {@link VectorStore} crudos, para el panel de
 * administracion (`GetKnowledgeStatsUseCase.count()`/`sample()`). Extiende `KnowledgeStack`
 * (no lo sustituye) para que sigua siendo asignable donde se espera un `KnowledgeStack`
 * simple (p. ej. `DiagnosisService`).
 *
 * El cuarto indice (`ecusIndex`) se crea aqui pero su store no se expone en `vectorStores`:
 * el panel de administracion sigue listando pids/dtcs/diagnoses (fuera del alcance de este
 * cambio).
 */
export interface KnowledgeStackWithStores extends KnowledgeStack {
  readonly vectorStores: KnowledgeVectorStores
}

/** Inicializa la base vectorial y los cuatro indices de conocimiento. */
export async function createKnowledgeStack(
  config: AppConfig,
  logger: LoggerPort,
): Promise<KnowledgeStackWithStores | undefined> {
  try {
    const { db } = await initLanceDb(config.LANCEDB_PATH)
    const [pidsStore, dtcsStore, diagnosesStore, ecusStore] = await Promise.all([
      createLanceVectorStore(db, PIDS_TABLE_CONFIG),
      createLanceVectorStore(db, DTCS_TABLE_CONFIG),
      createLanceVectorStore(db, DIAGNOSES_TABLE_CONFIG),
      createLanceVectorStore(db, ECUS_TABLE_CONFIG),
    ])
    return buildKnowledgeIndexes({ pidsStore, dtcsStore, diagnosesStore, ecusStore })
  } catch (err) {
    logger.warn('RAG knowledge stack unavailable, continuing without it', { err: String(err) })
    return undefined
  }
}

/** Los cuatro almacenes vectoriales ya abiertos, listos para envolverse en indices. */
interface KnowledgeStores {
  readonly pidsStore: VectorStore
  readonly dtcsStore: VectorStore
  readonly diagnosesStore: VectorStore
  readonly ecusStore: VectorStore
}

/**
 * Envuelve cada almacen en su indice con el par de mappers que le corresponde.
 *
 * Lista declarativa: los cuatro indices comparten forma y solo cambian el store y sus
 * dos mappers. Vive aparte de {@link createKnowledgeStack} para que alli quede a la
 * vista lo unico que ramifica, que es el `try/catch` de disponibilidad de LanceDB.
 */
function buildKnowledgeIndexes(stores: KnowledgeStores): KnowledgeStackWithStores {
  const embed: EmbeddingGenerator = createEmbedding
  const { pidsStore, dtcsStore, diagnosesStore, ecusStore } = stores
  return {
    pidsIndex: createKnowledgeIndex({
      store: pidsStore,
      embed,
      toMetadata: toPidMetadata,
      fromMetadata: toPidEntry,
    }),
    dtcsIndex: createKnowledgeIndex({
      store: dtcsStore,
      embed,
      toMetadata: toDtcMetadata,
      fromMetadata: toDtcEntry,
    }),
    diagnosisIndex: createKnowledgeIndex({
      store: diagnosesStore,
      embed,
      toMetadata: toDiagnosisMetadata,
      fromMetadata: toDiagnosisEntry,
    }),
    ecusIndex: createKnowledgeIndex({
      store: ecusStore,
      embed,
      toMetadata: toEcuMetadata,
      fromMetadata: toEcuEntry,
    }),
    vectorStores: { pids: pidsStore, dtcs: dtcsStore, diagnoses: diagnosesStore },
  }
}

/** Crea el puerto de búsqueda web si la API key está configurada. */
export function createWebSearchPort(config: AppConfig): WebSearchPort | undefined {
  if (!config.WEB_SEARCH_API_KEY) return undefined
  return createSerpApiClient({ apiKey: config.WEB_SEARCH_API_KEY })
}

/** Crea el `AdminController` con sus cinco casos de uso y el catalogo vectorial si existe. */
export function createAdminController(
  repos: Pick<PersistenceRepositories, 'userRepo' | 'logRepo' | 'auditRepo'>,
  knowledgeStack: KnowledgeStackWithStores | undefined,
): AdminController {
  return new AdminController({
    getOverview: new GetAdminOverviewUseCase({
      userRepo: repos.userRepo,
      logRepo: repos.logRepo,
      auditRepo: repos.auditRepo,
    }),
    listLogs: new ListSystemLogsUseCase(repos.logRepo),
    listAuditLogs: new ListAuditLogsUseCase(repos.auditRepo),
    listUsers: new ListUsersUseCase(repos.userRepo),
    getKnowledgeStats: knowledgeStack
      ? new GetKnowledgeStatsUseCase(knowledgeStack.vectorStores)
      : undefined,
    knowledgeStack,
  })
}

/** Traduce el stack de auth a los siete casos de uso que espera el controlador. */
function createAuthController(auth: AuthStack): AuthController {
  return new AuthController({
    registerUser: auth.registerUseCase,
    loginUser: auth.loginUseCase,
    refreshToken: auth.refreshUseCase,
    getCurrentUser: auth.getCurrentUserUseCase,
    logoutUser: auth.logoutUseCase,
    forgotPassword: auth.forgotPasswordUseCase,
    resetPassword: auth.resetPasswordUseCase,
  })
}

/** Repositorios que necesita la capa de diagnostico y administracion. */
interface DiagnosisLayerRepos {
  readonly vehicleRepo: SqliteVehicleRepository
  readonly userRepo: SqliteUserRepository
  readonly logRepo: PersistenceRepositories['logRepo']
  readonly auditRepo: PersistenceRepositories['auditRepo']
}

/**
 * Monta todo lo que cuelga del LLM y del vehiculo: cliente del modelo, catalogo
 * vectorial, busqueda web, servicio de diagnostico y los dos controladores que los
 * exponen. Es la mitad cara del arranque, y la unica con `await`.
 */
async function createDiagnosisLayer(
  config: AppConfig,
  logger: LoggerPort,
  repos: DiagnosisLayerRepos,
): Promise<{ diagnosisController: DiagnosisController; adminController: AdminController }> {
  const llmClient = createLlmClient(config, logger)
  const knowledgeStack = await createKnowledgeStack(config, logger)
  const diagnosisService = createDiagnosisService({
    config,
    llmClient,
    knowledgeStack,
    webSearch: createWebSearchPort(config),
    vehicleRepo: repos.vehicleRepo,
    logger,
  })
  return {
    diagnosisController: new DiagnosisController(diagnosisService, logger),
    adminController: createAdminController(
      { userRepo: repos.userRepo, logRepo: repos.logRepo, auditRepo: repos.auditRepo },
      knowledgeStack,
    ),
  }
}

/** Composition Root: cablea todas las dependencias y devuelve la app Express configurada. */
export async function buildApp(config: AppConfig): Promise<Application> {
  const { db, auditRepo, userRepo, tokenStore, logRepo, passwordResetTokenRepo } =
    createPersistenceRepositories(config)
  const logger = new Logger(config.NODE_ENV, db)
  const vehicleRepo = new SqliteVehicleRepository(db)
  const emailSender = createEmailSender(config, logger)
  const auth = createAuthStack(
    config,
    { userRepo, tokenStore, passwordResetTokenRepo },
    emailSender,
    logger,
  )
  await seedAdminUser(config, userRepo, auth.authService, logger)
  await seedManufacturerCatalog(vehicleRepo, logger)
  const authController = createAuthController(auth)
  const profile = createProfileStack({ userRepo, tokenStore }, auth.authService, logger)

  const { diagnosisController, adminController } = await createDiagnosisLayer(config, logger, {
    vehicleRepo,
    userRepo,
    logRepo,
    auditRepo,
  })

  return createServer({
    authController,
    diagnosisController,
    profileController: profile.profileController,
    adminController,
    requireAdmin: createRequireAdmin(userRepo),
    auditRepo,
    logger,
    allowedOrigins: config.ALLOWED_ORIGINS,
    nodeEnv: config.NODE_ENV,
    accessTokenSecret: config.ACCESS_TOKEN_SECRET,
  })
}
