import express from 'express'
import helmet from 'helmet'
import swaggerUi from 'swagger-ui-express'
import type { SimulationScenario } from '@/domain/simulationScenario.js'
import { openApiSpec } from '@/infrastructure/http/swagger.js'
import { createRateLimiter } from '@/infrastructure/http/middleware/rate-limiter.middleware.js'
import type { RateLimiterConfig } from '@/infrastructure/http/middleware/rate-limiter.middleware.js'
import { createAuditLogger } from '@/infrastructure/http/middleware/audit-logger.middleware.js'
import type { AuditLogRepositoryPort } from '@/application/ports/auditLogRepository.interface.js'
import { createAuthMiddleware } from '@/infrastructure/http/middleware/auth.middleware.js'
import { createAuthRoutes } from '@/infrastructure/http/routes/auth.routes.js'
import { createDiagnosisRoutes } from '@/infrastructure/http/routes/diagnosis.routes.js'
import type { UserRepository } from '@/application/ports/userRepository.interface.js'
import type { AuthServicePort } from '@/application/ports/authService.interface.js'
import type { RefreshTokenStorePort } from '@/application/ports/refreshTokenStore.interface.js'

/** Dependencias del servidor Express. */
export interface ServerDependencies {
  readonly scenarios: SimulationScenario[]
  readonly rateLimit?: Partial<RateLimiterConfig>
  readonly auditRepo?: AuditLogRepositoryPort
  readonly userRepo?: UserRepository
  readonly authService?: AuthServicePort
  readonly tokenStore?: RefreshTokenStorePort
  readonly accessTokenSecret?: string
}

/** Crea y devuelve la instancia de Express con todas las rutas montadas. */
export function createServer(deps: ServerDependencies): express.Application {
  const app = express()

  app.use(helmet())
  app.use(createRateLimiter(deps.rateLimit))
  if (deps.auditRepo) {
    app.use(createAuditLogger(deps.auditRepo))
  }
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

  if (deps.userRepo && deps.authService && deps.tokenStore) {
    app.use('/api/auth', createAuthRoutes(deps.userRepo, deps.authService, deps.tokenStore))
  }

  app.get('/api-docs.json', (_req, res) => {
    res.json(openApiSpec)
  })

  if (process.env.NODE_ENV !== 'production') {
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiSpec))
  }

  app.get('/', (_req, res) => {
    res.redirect('/api-docs')
  })

  app.get('/api', (_req, res) => {
    res.redirect('/api-docs')
  })

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() })
  })

  if (deps.accessTokenSecret) {
    app.use(createAuthMiddleware(deps.accessTokenSecret))
  }

  const diagnosisRouter = createDiagnosisRoutes({ scenarios: deps.scenarios })
  app.use('/api', diagnosisRouter)

  app.use(
    (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      console.error(`[ERROR] ${err.message}`)
      res.status(500).json({ error: 'Internal server error' })
    },
  )

  return app
}
