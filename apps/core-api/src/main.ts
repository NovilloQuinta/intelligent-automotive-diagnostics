import { createServer } from '@/infrastructure/http/server.js'
import type { SimulationScenario } from '@/infrastructure/hardware-simulator/simulationScenario.js'
import type { LiveData } from '@/domain/entities/liveData.js'

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
  },
  {
    id: 'kawa-z900',
    name: 'Kawasaki Z900',
    vehicleType: 'motorcycle',
    sensorValues: kawaData,
    dtcConfig: [],
  },
]

const PORT = Number(process.env.PORT) || 4000

const app = createServer(scenarios)

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`)
})
