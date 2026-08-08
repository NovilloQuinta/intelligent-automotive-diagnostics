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
import { AuthController } from '@/infrastructure/http/controllers/AuthController.js'
import { DiagnosisController } from '@/infrastructure/http/controllers/DiagnosisController.js'
import {
  DiagnosisService,
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
import { LiveData } from '@/domain/value-objects/liveData.js'
import { Vin } from '@/domain/value-objects/vin.js'
import { VehicleInfo } from '@/domain/value-objects/vehicleInfo.js'

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
    logRepo: new SqliteLogRepository(db),
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
 * `sensorValues` y `dtcConfig` DEBEN coincidir con lo que responden los
 * escenarios de `docker/elm327/`. Si divergen, la misma lectura aparece con
 * dos valores distintos en la pantalla.
 *
 * Deuda conocida: `sensorValues` desaparece cuando la telemetria se lea del
 * vehiculo en vez de generarse en el cliente.
 */
function createDockerScenarios(config: AppConfig): ScenarioDescriptor[] {
  return [
    {
      id: 'toyota',
      name: 'Toyota (Built-in)',
      vehicleType: 'car',
      sensorValues: new LiveData({ rpm: 750, coolantTemp: 55, speed: 0, intakeTemp: 17 }),
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
    },
    {
      id: 'audi-a3-tdi',
      name: 'Audi A3 2.0 TDI',
      vehicleType: 'car',
      sensorValues: new LiveData({ rpm: 770, coolantTemp: 90, speed: 0, intakeTemp: 35 }),
      dtcConfig: [
        { code: 'P0301', description: 'Cylinder 1 Misfire Detected' },
        { code: 'P0401', description: 'Exhaust Gas Recirculation Flow Insufficient Detected' },
        {
          code: 'P2002',
          description: 'Diesel Particulate Filter Efficiency Below Threshold (Bank 1)',
        },
      ],
      vehicleInfo: new VehicleInfo({
        make: 'Audi',
        model: 'A3',
        year: 2018,
        engineType: '2.0 TDI',
        vin: new Vin('WAUZZZ8V5JA123456'),
      }),
      host: config.ELM327_AUDI_HOST,
      port: config.ELM327_AUDI_PORT,
    },
    {
      id: 'kawasaki-z900',
      name: 'Kawasaki Z900',
      vehicleType: 'motorcycle',
      sensorValues: new LiveData({ rpm: 1300, coolantTemp: 95, speed: 0, intakeTemp: 28 }),
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
    },
  ]
}

/** Mapa scenarioId → ObdRepository creado a partir de los descriptores de escenarios. */
function createObdRepoMap(scenarios: ScenarioDescriptor[]): Map<string, ObdRepository> {
  const map = new Map<string, ObdRepository>()
  for (const s of scenarios) {
    map.set(s.id, new Elm327TcpRepository({ host: s.host, port: s.port }))
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
  const { db, auditRepo, userRepo, tokenStore, logRepo } = createPersistenceRepositories(config)
  const logger = new Logger(config.NODE_ENV, db)
  const auth = createAuthStack(config, { userRepo, tokenStore }, logger)
  await seedAdminUser(config, userRepo, auth.authService, logger)
  const authController = new AuthController({
    registerUser: auth.registerUseCase,
    loginUser: auth.loginUseCase,
    refreshToken: auth.refreshUseCase,
    getCurrentUser: auth.getCurrentUserUseCase,
    logoutUser: auth.logoutUseCase,
  })

  const llmClient = createLlmClient(config, logger)
  const knowledgeStack = await createKnowledgeStack(config, logger)
  const webSearch = createWebSearchPort(config)

  let diagnosisService: DiagnosisService

  if (config.OBD_MODE === 'docker') {
    const scenarios = createDockerScenarios(config)
    const obdRepos = createObdRepoMap(scenarios)
    diagnosisService = new DiagnosisService({
      scenarios,
      obdRepos,
      llmClient,
      logger,
      knowledgeStack,
      webSearch,
    })
  } else {
    const obdRepo = new Elm327TcpRepository({
      host: config.ELM327_HOST,
      port: config.ELM327_PORT,
    })
    diagnosisService = new DiagnosisService({
      scenarios: [],
      obdRepo,
      llmClient,
      logger,
      knowledgeStack,
      webSearch,
    })
  }

  const diagnosisController = new DiagnosisController(diagnosisService, logger)
  const adminController = createAdminController({ userRepo, logRepo, auditRepo }, knowledgeStack)

  return createServer({
    authController,
    diagnosisController,
    adminController,
    requireAdmin: createRequireAdmin(userRepo),
    auditRepo,
    logger,
    allowedOrigins: config.ALLOWED_ORIGINS,
    nodeEnv: config.NODE_ENV,
    accessTokenSecret: config.ACCESS_TOKEN_SECRET,
  })
}
