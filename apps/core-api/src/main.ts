import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '@/infrastructure/persistence/sqlite/schema.js'
import { createServer } from '@/infrastructure/http/server.js'
import { SqliteUserRepository } from '@/infrastructure/persistence/sqlite/userRepository.js'
import { SqliteRefreshTokenStore } from '@/infrastructure/persistence/sqlite/refreshTokenStore.js'
import { createAuthService } from '@/infrastructure/services/authService.js'
import { Vin } from '@/domain/vin.js'
import type { SimulationScenario } from '@/domain/simulationScenario.js'
import type { LiveData } from '@/domain/liveData.js'

const OBD_MODE = process.env.OBD_MODE ?? 'sync'
const DB_PATH = process.env.DB_PATH ?? 'data/diagnostics.db'
const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET ?? 'dev-access-secret'
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET ?? 'dev-refresh-secret'

const sqlite = new Database(DB_PATH)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

const db = drizzle(sqlite, { schema })
const userRepo = new SqliteUserRepository(db)
const tokenStore = new SqliteRefreshTokenStore(db)
const authService = createAuthService({
  accessTokenSecret: ACCESS_TOKEN_SECRET,
  refreshTokenSecret: REFRESH_TOKEN_SECRET,
  accessTokenExpiresIn: '15m',
  refreshTokenExpiresIn: '7d',
  tokenStore,
})

const audiIdleData: LiveData = {
  rpm: 750,
  coolantTemp: 90,
  speed: 0,
  intakeTemp: 25,
}

const kawaData: LiveData = {
  rpm: 4500,
  coolantTemp: 105,
  speed: 0,
  intakeTemp: 28,
}

const scenarios: SimulationScenario[] = [
  {
    id: 'audi-a3-idle',
    name: 'Audi A3 al ralentí',
    vehicleType: 'car',
    sensorValues: audiIdleData,
    dtcConfig: [{ code: 'P0301', description: 'Cylinder 1 Misfire' }],
    vehicleInfo: {
      make: 'Audi',
      model: 'A3',
      year: 2018,
      engineType: '2.0 TFSI',
      vin: Vin.create('WAUZZZ8V5JA123456'),
    },
  },
  {
    id: 'kawa-z900',
    name: 'Kawasaki Z900',
    vehicleType: 'motorcycle',
    sensorValues: kawaData,
    dtcConfig: [],
    vehicleInfo: {
      make: 'Kawasaki',
      model: 'Z900',
      year: 2020,
      engineType: '948cc Inline-4',
      vin: Vin.create('JKAZR2A1XLA000111'),
    },
  },
]

const PORT = Number(process.env.PORT) || 4000

const app = createServer({
  scenarios,
  userRepo,
  authService,
  tokenStore,
  accessTokenSecret: ACCESS_TOKEN_SECRET,
})

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT} (OBD_MODE=${OBD_MODE})`)
})
