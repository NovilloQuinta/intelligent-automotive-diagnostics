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
import type { ObdRepositoryPort } from '@/application/ports/obdRepository.port.js'
import { createAnthropicClient } from '@/infrastructure/llm/anthropicClient.js'
import { createOpenAiClient } from '@/infrastructure/llm/openAiClient.js'
import type { LlmClientPort } from '@/application/ports/llmClient.port.js'

const OBD_MODE = process.env.OBD_MODE ?? 'sync'
const LLM_PROVIDER = process.env.LLM_PROVIDER
const ELM327_HOST = process.env.ELM327_HOST ?? 'localhost'
const ELM327_PORT = Number(process.env.ELM327_PORT) || 35000
const DB_PATH = process.env.DB_PATH ?? 'data/diagnostics.db'
const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET ?? 'dev-access-secret'
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET ?? 'dev-refresh-secret'

if (process.env.NODE_ENV === 'production') {
  if (ACCESS_TOKEN_SECRET === 'dev-access-secret') {
    throw new Error('ACCESS_TOKEN_SECRET must be set in production')
  }
  if (REFRESH_TOKEN_SECRET === 'dev-refresh-secret') {
    throw new Error('REFRESH_TOKEN_SECRET must be set in production')
  }
}

const db = getDb(DB_PATH)
const userRepo = new SqliteUserRepository(db)
const tokenStore = new SqliteRefreshTokenStore(db)
const authService = createAuthService({
  accessTokenSecret: ACCESS_TOKEN_SECRET,
  refreshTokenSecret: REFRESH_TOKEN_SECRET,
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

const PORT = Number(process.env.PORT) || 4000

// Modo dual OBD: 'sync' usa el simulador in-process con escenarios;
// 'tcp' inyecta el repositorio ELM327 contra el emulador Docker.
const obdRepo: ObdRepositoryPort | undefined =
  OBD_MODE === 'tcp' ? new Elm327TcpRepository({ host: ELM327_HOST, port: ELM327_PORT }) : undefined

// Cliente LLM para el diagnóstico cognitivo (endpoint montado solo si se configura un proveedor).
let llmClient: LlmClientPort | undefined
if (LLM_PROVIDER === 'anthropic') {
  llmClient = createAnthropicClient({
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    model: process.env.LLM_MODEL,
  })
} else if (LLM_PROVIDER === 'openai') {
  llmClient = createOpenAiClient({
    apiKey: process.env.LLM_API_KEY ?? '',
    baseURL: process.env.LLM_BASE_URL ?? '',
    model: process.env.LLM_MODEL ?? '',
  })
}

const app = createServer({
  scenarios: OBD_MODE === 'tcp' ? [] : scenarios,
  obdRepo,
  userRepo,
  authService,
  tokenStore,
  accessTokenSecret: ACCESS_TOKEN_SECRET,
  llmClient,
})

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT} (OBD_MODE=${OBD_MODE})`)
})
