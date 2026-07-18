import express from 'express'
import helmet from 'helmet'
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

  app.use(helmet())
  app.use(express.json({ limit: '10kb' }))

  const allowedOrigins = ['http://localhost:4000', 'http://localhost:3000', 'http://localhost:5173']
  app.use((req, res, next) => {
    const origin = req.headers.origin
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin)
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    if (req.method === 'OPTIONS') {
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

  if (process.env.NODE_ENV !== 'production') {
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiSpec))
  }

  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error(`[ERROR] ${err.message}`)
      res.status(500).json({ error: 'Internal server error' })
    },
  )

  return app
}
