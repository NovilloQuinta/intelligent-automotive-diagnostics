import express from 'express'
import { createDiagnosisController } from '@/infrastructure/http/controllers/diagnosisController.js'
import type { SimulationScenario } from '@/infrastructure/hardware-simulator/simulationScenario.js'

/** Crea y devuelve la instancia de Express con todas las rutas montadas. */
export function createServer(scenarios: SimulationScenario[]): express.Application {
  const app = express()
  const controller = createDiagnosisController(scenarios)

  app.use(express.json())

  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    if (_req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }
    next()
  })

  app.get('/api/scenarios', controller.getScenarios)
  app.post('/api/diagnosis', controller.runDiagnosis)

  return app
}
