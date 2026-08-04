import { getDb } from '@/infrastructure/persistence/sqlite/db.js'
import { createServer } from '@/infrastructure/http/server.js'
import { SqliteUserRepository } from '@/infrastructure/persistence/sqlite/userRepository.js'
import { SqliteRefreshTokenStore } from '@/infrastructure/persistence/sqlite/refreshTokenStore.js'
import { createAuthService } from '@/infrastructure/services/authService.js'
import { Vin } from '@/domain/value-objects/vin.js'
import { VehicleType } from '@/infrastructure/obd/simulationScenario.js'
import type { SimulationScenario } from '@/infrastructure/obd/simulationScenario.js'
import { LiveData } from '@/domain/value-objects/liveData.js'
import { Elm327TcpRepository } from '@/infrastructure/obd/elm327TcpRepository.js'
import type { ObdRepository } from '@/application/ports/ObdRepository.js'
import { createAnthropicClient } from '@/infrastructure/llm/anthropicClient.js'
import { createOpenAiClient } from '@/infrastructure/llm/openAiClient.js'
import type { LlmClientPort } from '@/application/ports/LlmClientPort.js'
import { loadConfig, assertProductionSecrets } from '@/infrastructure/configuration/index.js'

const config = loadConfig()
assertProductionSecrets(config)

const db = getDb(config.DB_PATH)
const userRepo = new SqliteUserRepository(db)
const tokenStore = new SqliteRefreshTokenStore(db)
const authService = createAuthService({
  accessTokenSecret: config.ACCESS_TOKEN_SECRET,
  refreshTokenSecret: config.REFRESH_TOKEN_SECRET,
  accessTokenExpiresIn: '15m',
  refreshTokenExpiresIn: '7d',
  tokenStore,
})

const audiIdleData = new LiveData({ rpm: 750, coolantTemp: 90, speed: 0, intakeTemp: 25 })

const kawaData = new LiveData({ rpm: 4500, coolantTemp: 105, speed: 0, intakeTemp: 28 })

const scenarios: SimulationScenario[] = [
  {
    id: 'audi-a3-idle',
    name: 'Audi A3 al ralentí',
    vehicleType: VehicleType.Car,
    sensorValues: audiIdleData,
    dtcConfig: [{ code: 'P0301', description: 'Cylinder 1 Misfire' }],
    vehicleInfo: {
      make: 'Audi',
      model: 'A3',
      year: 2018,
      engineType: '2.0 TFSI',
      vin: new Vin('WAUZZZ8V5JA123456'),
    },
  },
  {
    id: 'kawa-z900',
    name: 'Kawasaki Z900',
    vehicleType: VehicleType.Motorcycle,
    sensorValues: kawaData,
    dtcConfig: [],
    vehicleInfo: {
      make: 'Kawasaki',
      model: 'Z900',
      year: 2020,
      engineType: '948cc Inline-4',
      vin: new Vin('JKAZR2A1XLA000111'),
    },
  },
]

// Modo dual OBD: 'sync' usa el simulador in-process con escenarios;
// 'tcp' inyecta el repositorio ELM327 contra el emulador Docker.
const obdRepo: ObdRepository | undefined =
  config.OBD_MODE === 'tcp' ? new Elm327TcpRepository({ host: config.ELM327_HOST, port: config.ELM327_PORT }) : undefined

// Cliente LLM para el diagnóstico cognitivo (endpoint montado solo si se configura un proveedor).
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

const app = createServer({
  scenarios: config.OBD_MODE === 'tcp' ? [] : scenarios,
  obdRepo,
  userRepo,
  authService,
  tokenStore,
  accessTokenSecret: config.ACCESS_TOKEN_SECRET,
  llmClient,
  allowedOrigins: config.ALLOWED_ORIGINS,
  nodeEnv: config.NODE_ENV,
})

app.listen(config.PORT, () => {
  console.log(`API listening on http://localhost:${config.PORT} (OBD_MODE=${config.OBD_MODE})`)
})
