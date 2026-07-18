import express from 'express'
import swaggerUi from 'swagger-ui-express'
import { createDiagnosisController } from '@/infrastructure/http/controllers/diagnosisController.js'
import type { SimulationScenario } from '@/infrastructure/hardware-simulator/simulationScenario.js'
import { openApiSpec } from '@/infrastructure/http/swagger.js'

/** Configuración del servidor Express. */
export interface ServerConfig {
  readonly mode: string
  readonly scenarios: SimulationScenario[]
}

/** Crea y devuelve la instancia de Express con todas las rutas montadas. */
export function createServer(config: ServerConfig): express.Application {
  const app = express()
  const controller = createDiagnosisController(config)

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

  app.get('/', (_req, res) => {
    res.redirect('/api-docs')
  })

  app.get('/api', (_req, res) => {
    res.redirect('/api-docs')
  })

  app.get('/api-docs.json', (_req, res) => {
    res.json(openApiSpec)
  })

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiSpec))

  return app
}
