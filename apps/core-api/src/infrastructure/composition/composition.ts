import type { Application } from 'express'
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
import { Elm327TcpRepository } from '@/infrastructure/elm327/elm327Adapter.js'
import { createElm327TcpClient } from '@/infrastructure/elm327/tcpTransport.js'
import { createElm327SerialClient } from '@/infrastructure/elm327/serialTransport.js'
import type { ObdRepository } from '@/application/ports/ObdRepository.js'
import type { VehicleRepository } from '@/application/ports/VehicleRepository.js'
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
import {
  DiagnosisService,
  SERIAL_DIRECT_SCENARIO,
  type ScenarioDescriptor,
} from '@/infrastructure/services/diagnosisService.js'
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
} from '@/infrastructure/persistence/vector/vectorTableConfigs.js'
import { createKnowledgeIndex } from '@/application/knowledge/createKnowledgeIndex.js'
import { toPidMetadata, toPidEntry } from '@/application/knowledge/pidKnowledgeMapper.js'
import { toDtcMetadata, toDtcEntry } from '@/application/knowledge/dtcKnowledgeMapper.js'
import {
  toDiagnosisMetadata,
  toDiagnosisEntry,
} from '@/application/knowledge/diagnosisKnowledgeMapper.js'
import type { EmbeddingGenerator } from '@/application/ports/EmbeddingGenerator.js'
import type { KnowledgeStack } from '@/application/ports/KnowledgeStack.js'
import type { KnowledgeVectorStores } from '@/application/use-cases/admin/GetKnowledgeStatsUseCase.js'
import type { WebSearchPort } from '@/application/ports/WebSearchPort.js'
import { createSerpApiClient } from '@/infrastructure/web-search/serpApiClient.js'
import { Vin } from '@/domain/value-objects/vin.js'
import { VehicleInfo } from '@/domain/value-objects/vehicleInfo.js'

const ACCESS_TOKEN_TTL = '15m'
const REFRESH_TOKEN_TTL = '7d'

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
function createAuthStack(
  config: AppConfig,
  repos: Pick<PersistenceRepositories, 'userRepo' | 'tokenStore' | 'passwordResetTokenRepo'>,
  emailSender: EmailSenderPort,
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
 * Escenarios disponibles en modo Docker emulador.
 *
 * La telemetria (PIDs 05, 0C, 0D, 0F) y los codigos de averia se leen en
 * tiempo real del emulador via `GET /api/live-data` y `GET /api/dtc-codes`.
 * No se hardcodean valores que el emulador ya provee.
 */
function toyotaScenario(config: AppConfig): ScenarioDescriptor {
  return {
    id: 'toyota',
    name: 'Toyota (Built-in)',
    vehicleType: 'car',
    connectionType: 'wifi',
    dtcConfig: [],
    vehicleInfo: new VehicleInfo({
      make: 'Toyota',
      model: 'Auris Hybrid',
      year: 2016,
      engineType: '1.8L Hybrid',
      vin: new Vin('JTDKN3DU60A123456'),
    }),
    host: config.ELM327_TOYOTA_HOST,
    port: config.ELM327_TOYOTA_PORT,
  }
}

function audiScenario(config: AppConfig): ScenarioDescriptor {
  return {
    id: 'audi-a3-tdi',
    name: 'Audi A3 2.0 TDI',
    vehicleType: 'car',
    connectionType: 'wifi',
    vehicleInfo: new VehicleInfo({
      make: 'Audi',
      model: 'A3',
      year: 2018,
      engineType: '2.0 TDI',
      vin: new Vin('WAUZZZ8V5JA123456'),
    }),
    host: config.ELM327_AUDI_HOST,
    port: config.ELM327_AUDI_PORT,
  }
}

function kawasakiScenario(config: AppConfig): ScenarioDescriptor {
  return {
    id: 'kawasaki-z900',
    name: 'Kawasaki Z900',
    vehicleType: 'motorcycle',
    connectionType: 'wifi',
    dtcConfig: [],
    vehicleInfo: new VehicleInfo({
      make: 'Kawasaki',
      model: 'Z900',
      year: 2020,
      engineType: '948cc Inline-4',
      vin: new Vin('JKAZR2A1XLA000111'),
    }),
    host: config.ELM327_KAWASAKI_HOST,
    port: config.ELM327_KAWASAKI_PORT,
  }
}

function createDockerScenarios(config: AppConfig): ScenarioDescriptor[] {
  return [toyotaScenario(config), audiScenario(config), kawasakiScenario(config)]
}

/** Mapa scenarioId → ObdRepository creado a partir de los descriptores de escenarios. */
function createObdRepoMap(
  scenarios: ScenarioDescriptor[],
  vehicleRepo: VehicleRepository,
  logger: LoggerPort,
): Map<string, ObdRepository> {
  const map = new Map<string, ObdRepository>()
  for (const s of scenarios) {
    const transport = createElm327TcpClient({ host: s.host, port: s.port })
    map.set(s.id, new Elm327TcpRepository(transport, vehicleRepo, logger))
  }
  return map
}

/**
 * {@link KnowledgeStack} ampliado con los tres {@link VectorStore} crudos, para el panel de
 * administracion (`GetKnowledgeStatsUseCase.count()`/`sample()`). Extiende `KnowledgeStack`
 * (no lo sustituye) para que sigua siendo asignable donde se espera un `KnowledgeStack`
 * simple (p. ej. `DiagnosisService`).
 */
export interface KnowledgeStackWithStores extends KnowledgeStack {
  readonly vectorStores: KnowledgeVectorStores
}

/** Inicializa la base vectorial y los tres indices de conocimiento. */
export async function createKnowledgeStack(
  config: AppConfig,
  logger: LoggerPort,
): Promise<KnowledgeStackWithStores | undefined> {
  try {
    const { db } = await initLanceDb(config.LANCEDB_PATH)
    const embed: EmbeddingGenerator = createEmbedding
    const [pidsStore, dtcsStore, diagnosesStore] = await Promise.all([
      createLanceVectorStore(db, PIDS_TABLE_CONFIG),
      createLanceVectorStore(db, DTCS_TABLE_CONFIG),
      createLanceVectorStore(db, DIAGNOSES_TABLE_CONFIG),
    ])
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
      vectorStores: { pids: pidsStore, dtcs: dtcsStore, diagnoses: diagnosesStore },
    }
  } catch (err) {
    logger.warn('RAG knowledge stack unavailable, continuing without it', { err: String(err) })
    return undefined
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
  const authController = new AuthController({
    registerUser: auth.registerUseCase,
    loginUser: auth.loginUseCase,
    refreshToken: auth.refreshUseCase,
    getCurrentUser: auth.getCurrentUserUseCase,
    logoutUser: auth.logoutUseCase,
    forgotPassword: auth.forgotPasswordUseCase,
    resetPassword: auth.resetPasswordUseCase,
  })

  const profile = createProfileStack({ userRepo, tokenStore }, auth.authService, logger)

  const llmClient = createLlmClient(config, logger)
  const knowledgeStack = await createKnowledgeStack(config, logger)
  const webSearch = createWebSearchPort(config)
  const diagnosisService = createDiagnosisService({
    config,
    llmClient,
    knowledgeStack,
    webSearch,
    vehicleRepo,
    logger,
  })
  const diagnosisController = new DiagnosisController(diagnosisService, logger)
  const adminController = createAdminController({ userRepo, logRepo, auditRepo }, knowledgeStack)

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

interface CreateDiagnosisServiceOptions {
  readonly config: AppConfig
  readonly llmClient: LlmClientPort | undefined
  readonly knowledgeStack: KnowledgeStack | undefined
  readonly webSearch: WebSearchPort | undefined
  readonly vehicleRepo: VehicleRepository
  readonly logger: LoggerPort
}

/** Crea el servicio de diagnostico con el repositorio OBD adecuado segun el modo. */
function createDiagnosisService(opts: CreateDiagnosisServiceOptions): DiagnosisService {
  const { config, llmClient, knowledgeStack, webSearch, vehicleRepo, logger } = opts
  if (config.OBD_MODE === 'docker') {
    const scenarios = createDockerScenarios(config)
    const obdRepos = createObdRepoMap(scenarios, vehicleRepo, logger)
    return new DiagnosisService({
      scenarios,
      obdRepos,
      llmClient,
      logger,
      knowledgeStack,
      webSearch,
      vehicleRepo,
    })
  }
  if (config.OBD_MODE === 'serial') {
    const transport = createElm327SerialClient({
      path: config.SERIAL_PORT_PATH,
      baudRate: config.SERIAL_BAUD_RATE,
    })
    const obdRepo = new Elm327TcpRepository(transport, vehicleRepo, logger)
    return new DiagnosisService({
      scenarios: [],
      obdRepo,
      directScenario: SERIAL_DIRECT_SCENARIO,
      llmClient,
      logger,
      knowledgeStack,
      webSearch,
      vehicleRepo,
    })
  }
  const transport = createElm327TcpClient({
    host: config.ELM327_HOST,
    port: config.ELM327_PORT,
  })
  const obdRepo = new Elm327TcpRepository(transport, vehicleRepo, logger)
  return new DiagnosisService({
    scenarios: [],
    obdRepo,
    llmClient,
    logger,
    knowledgeStack,
    webSearch,
    vehicleRepo,
  })
}
