import { randomUUID } from 'node:crypto'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import swaggerUi from 'swagger-ui-express'
import { openApiSpec } from '@/infrastructure/http/swagger.js'
import { createRateLimiter } from '@/infrastructure/http/middleware/rate-limiter.middleware.js'
import type { RateLimiterConfig } from '@/infrastructure/http/middleware/rate-limiter.middleware.js'
import { createAuditLogger } from '@/infrastructure/http/middleware/audit-logger.middleware.js'
import type { AuditLogRepository } from '@/application/ports/AuditLogRepository.js'
import { createAuthMiddleware } from '@/infrastructure/http/middleware/auth.middleware.js'
import { createAuthRoutes } from '@/infrastructure/http/routes/auth.routes.js'
import { createDiagnosisRoutes } from '@/infrastructure/http/routes/diagnosis.routes.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import type { AuthController } from '@/infrastructure/http/controllers/AuthController.js'
import type { DiagnosisController } from '@/infrastructure/http/controllers/DiagnosisController.js'

/** Dependencias del servidor Express. */
export interface ServerDependencies {
  readonly rateLimit?: Partial<RateLimiterConfig>
  readonly auditRepo: AuditLogRepository
  readonly authController: AuthController
  readonly diagnosisController: DiagnosisController
  readonly accessTokenSecret?: string
  readonly allowedOrigins: string
  readonly nodeEnv: string
  readonly logger: LoggerPort
}

/** Middleware base: seguridad, logging y parseo JSON. */
function applyBaseMiddleware(app: express.Application, deps: ServerDependencies): void {
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
      },
      frameguard: { action: 'deny' },
    }),
  )
  app.use(createRateLimiter(deps.rateLimit))
  app.use(createAuditLogger(deps.auditRepo))
  app.use(express.json({ limit: '10kb' }))
}

/** CORS con allowlist de origins usando el paquete `cors`. */
function applyCors(app: express.Application, allowedOrigins: string): void {
  const origins = allowedOrigins.split(',')

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || origins.includes(origin)) {
          callback(null, origin ?? true)
        } else {
          callback(new Error('Not allowed by CORS'))
        }
      },
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 600,
    }),
  )
}

/** Rutas de información: spec OpenAPI, swagger UI y health check. */
function mountInfoRoutes(app: express.Application, nodeEnv: string): void {
  app.get('/api-docs.json', (_req, res) => {
    res.json(openApiSpec)
  })

  if (nodeEnv !== 'production') {
    app.use(
      '/api-docs',
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:'],
          },
        },
      }),
    )
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
}

/** Error handler global: responde 500 sin filtrar detalles internos. */
function mountErrorHandler(app: express.Application, logger: LoggerPort): void {
  app.use(
    (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      const message = err instanceof Error ? err.message : 'Unknown error'
      logger.error(message)
      res.status(500).json({ error: 'Internal server error' })
    },
  )
}

/** Crea y devuelve la instancia de Express con todas las rutas montadas. */
export function createServer(deps: ServerDependencies): express.Application {
  const app = express()

  // Confiar en el proxy inverso para obtener IPs reales
  app.set('trust proxy', 1)

  // X-Request-Id: header de correlacion para trazabilidad
  app.use((req, _res, next) => {
    req.headers['x-request-id'] = req.headers['x-request-id'] ?? randomUUID()
    next()
  })

  applyBaseMiddleware(app, deps)
  applyCors(app, deps.allowedOrigins)

  // Archivos estaticos (security.txt, etc.)
  app.use(express.static('public'))

  const authMiddleware = deps.accessTokenSecret
    ? createAuthMiddleware(deps.accessTokenSecret)
    : undefined

  const loginLimiter = createRateLimiter({ windowMinutes: 1, maxRequests: 5 })
  const refreshLimiter = createRateLimiter({ windowMinutes: 1, maxRequests: 10 })

  app.use('/api/auth', createRateLimiter({ windowMinutes: 15, maxRequests: 20 }))
  app.use(
    '/api/auth',
    createAuthRoutes(deps.authController, authMiddleware, loginLimiter, refreshLimiter),
  )

  mountInfoRoutes(app, deps.nodeEnv)

  if (authMiddleware) {
    app.use(authMiddleware)
  }

  // Rate limits para endpoints sensibles de diagnostico
  const diagnosisLimiter = createRateLimiter({ windowMinutes: 1, maxRequests: 20 })
  const cognitiveLimiter = createRateLimiter({ windowMinutes: 1, maxRequests: 5 })

  app.use('/api/diagnosis', diagnosisLimiter)
  app.use('/api/mcp/cognitive-diagnosis', cognitiveLimiter)

  app.use('/api', createDiagnosisRoutes(deps.diagnosisController))

  mountErrorHandler(app, deps.logger)

  return app
}
