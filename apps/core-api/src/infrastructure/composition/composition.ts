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

/** Escenarios disponibles en modo Docker emulador. */
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
      sensorValues: new LiveData({ rpm: 800, coolantTemp: 90, speed: 0, intakeTemp: 35 }),
      dtcConfig: [{ code: 'P0301', description: 'Cylinder 1 Misfire' }],
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

/** Inicializa la base vectorial y los tres indices de conocimiento. */
export async function createKnowledgeStack(
  config: AppConfig,
  logger: LoggerPort,
): Promise<KnowledgeStack | undefined> {
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
    }
  } catch (err) {
    logger.warn('RAG knowledge stack unavailable, continuing without it', { err: String(err) })
    return undefined
  }
}

/** Composition Root: cablea todas las dependencias y devuelve la app Express configurada. */
export async function buildApp(config: AppConfig): Promise<Application> {
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

  const llmClient = createLlmClient(config, logger)
  const knowledgeStack = await createKnowledgeStack(config, logger)

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
    })
  }

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
