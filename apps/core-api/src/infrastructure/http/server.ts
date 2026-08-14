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
import { createProfileRoutes } from '@/infrastructure/http/routes/profile.routes.js'
import { createAdminRoutes } from '@/infrastructure/http/routes/admin.routes.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import type { AuthController } from '@/infrastructure/http/controllers/AuthController.js'
import type { DiagnosisController } from '@/infrastructure/http/controllers/DiagnosisController.js'
import type { ProfileController } from '@/infrastructure/http/controllers/ProfileController.js'
import type { AdminController } from '@/infrastructure/http/controllers/AdminController.js'
import type { RequestHandler } from 'express'

/** Limite de cuerpo por defecto: sobrado para cualquier peticion de la API salvo el chat. */
const DEFAULT_BODY_LIMIT = '10kb'

/** Ruta del diagnostico cognitivo, unica que recibe el hilo de conversacion completo. */
const COGNITIVE_DIAGNOSIS_PATH = '/api/mcp/cognitive-diagnosis'

/** Limite de cuerpo del chat cognitivo: acotado, pero con margen para un hilo largo. */
const COGNITIVE_BODY_LIMIT = '1mb'

/** Codigo de estado del cuerpo demasiado grande (RFC 9110). */
const HTTP_PAYLOAD_TOO_LARGE = 413

/** Dependencias del servidor Express. */
export interface ServerDependencies {
  readonly rateLimit?: Partial<RateLimiterConfig>
  readonly adminRateLimit?: Partial<RateLimiterConfig>
  readonly auditRepo: AuditLogRepository
  readonly authController: AuthController
  readonly diagnosisController: DiagnosisController
  readonly profileController?: ProfileController
  /** `undefined` en tests que no ejercitan `/api/admin` (evita cablear el stack completo). */
  readonly adminController?: AdminController
  /** Construido en `composition.ts` con `createRequireAdmin(userRepo)`. */
  readonly requireAdmin?: RequestHandler
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
  // El chat cognitivo reenvia el hilo entero en cada pregunta, asi que su cuerpo
  // crece con la conversacion y con 10 KB se agotaba a la tercera pregunta. Lleva
  // su propio limite en lugar de aflojar el global, que protege al resto de la API.
  app.use(COGNITIVE_DIAGNOSIS_PATH, express.json({ limit: COGNITIVE_BODY_LIMIT }))
  app.use(express.json({ limit: DEFAULT_BODY_LIMIT }))
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

/** Marca con la que `body-parser` senala un cuerpo mayor que el limite de la ruta. */
const PAYLOAD_TOO_LARGE_TYPE = 'entity.too.large'

/** Distingue el cuerpo demasiado grande de un fallo propio: el llamante puede corregirlo. */
function isPayloadTooLarge(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { type?: string }).type === PAYLOAD_TOO_LARGE_TYPE
  )
}

/** Error handler global: 500 sin filtrar detalles internos, salvo el cuerpo demasiado grande. */
function mountErrorHandler(app: express.Application, logger: LoggerPort): void {
  app.use(
    (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      const message = err instanceof Error ? err.message : 'Unknown error'
      logger.error(message)
      // Un cuerpo demasiado grande salia como 500 "Internal server error", y el
      // cliente no podia distinguirlo de una caida: es 413 y tiene arreglo.
      if (isPayloadTooLarge(err)) {
        res.status(HTTP_PAYLOAD_TOO_LARGE).json({ error: 'Request body is too large' })
        return
      }
      res.status(500).json({ error: 'Internal server error' })
    },
  )
}

/** Propaga un `x-request-id` por peticion para poder correlacionar trazas. */
function applyRequestId(app: express.Application): void {
  app.use((req, _res, next) => {
    req.headers['x-request-id'] = req.headers['x-request-id'] ?? randomUUID()
    next()
  })
}

/** Monta las rutas de autenticacion con sus limites por operacion. */
function mountAuthRoutes(
  app: express.Application,
  deps: ServerDependencies,
  authMiddleware: express.RequestHandler | undefined,
): void {
  const loginLimiter = createRateLimiter({ windowMinutes: 1, maxRequests: 5 })
  const refreshLimiter = createRateLimiter({ windowMinutes: 1, maxRequests: 10 })
  // Rate limit dedicado para forgot-password: mas estricto que login (evita abuso del envio de email)
  const forgotPasswordLimiter = createRateLimiter({ windowMinutes: 15, maxRequests: 5 })

  app.use('/api/auth', createRateLimiter({ windowMinutes: 15, maxRequests: 20 }))
  app.use(
    '/api/auth',
    createAuthRoutes(
      deps.authController,
      authMiddleware,
      loginLimiter,
      refreshLimiter,
      forgotPasswordLimiter,
    ),
  )
}

/**
 * Los endpoints de diagnostico consultan el vehiculo o el LLM, asi que llevan
 * limites mas estrictos que el global. El cognitivo es el mas caro de todos.
 */
function applyDiagnosisRateLimits(app: express.Application): void {
  const diagnosisLimiter = createRateLimiter({ windowMinutes: 1, maxRequests: 20 })
  const cognitiveLimiter = createRateLimiter({ windowMinutes: 1, maxRequests: 5 })
  const clearDtcLimiter = createRateLimiter({ windowMinutes: 1, maxRequests: 5 })

  app.use('/api/diagnosis', diagnosisLimiter)
  app.use('/api/freeze-frame', diagnosisLimiter)
  app.use('/api/ecu-info', diagnosisLimiter)
  app.use('/api/pending-dtc', diagnosisLimiter)
  app.use('/api/permanent-dtc', diagnosisLimiter)
  app.use('/api/vehicle-status', diagnosisLimiter)
  app.use('/api/mcp/cognitive-diagnosis', cognitiveLimiter)
  app.use('/api/clear-dtc', clearDtcLimiter)
}

/**
 * Rate limiter propio de `/api/admin`, independiente del resto de la API (Requirement
 * "Todas las rutas de administracion exigen rol admin y limitan tasa"). Un operador
 * navegando el panel no debe agotar el limite de `/api/diagnosis` ni de `/api/auth`, y
 * viceversa.
 */
function applyAdminRateLimits(
  app: express.Application,
  config: Partial<RateLimiterConfig> | undefined,
): void {
  app.use('/api/admin', createRateLimiter(config ?? { windowMinutes: 1, maxRequests: 30 }))
}

/**
 * Monta `/api/admin` con el orden exigido por `design.md` (Decision 6):
 * `authMiddleware` (ya global en este punto) -> `requireAdmin` -> rate limiter -> controlador.
 * Sin `adminController`/`requireAdmin` no se monta nada, para no exponer rutas a medio cablear.
 */
function mountAdminRoutes(app: express.Application, deps: ServerDependencies): void {
  if (!deps.adminController || !deps.requireAdmin) return

  app.use('/api/admin', deps.requireAdmin)
  applyAdminRateLimits(app, deps.adminRateLimit)
  app.use('/api/admin', createAdminRoutes(deps.adminController))
}

/** Crea y devuelve la instancia de Express con todas las rutas montadas. */
export function createServer(deps: ServerDependencies): express.Application {
  const app = express()

  // Sin esto express ve la IP del proxy, no la del cliente, y el rate limit
  // acabaria contando todo el trafico como si viniera de un unico origen.
  app.set('trust proxy', 1)

  applyRequestId(app)
  applyBaseMiddleware(app, deps)
  applyCors(app, deps.allowedOrigins)
  app.use(express.static('public'))

  const authMiddleware = deps.accessTokenSecret
    ? createAuthMiddleware(deps.accessTokenSecret)
    : undefined

  mountAuthRoutes(app, deps, authMiddleware)
  mountInfoRoutes(app, deps.nodeEnv)

  // A partir de aqui todo requiere token: se monta antes que las rutas de diagnostico.
  if (authMiddleware) {
    app.use(authMiddleware)
  }

  applyDiagnosisRateLimits(app)
  app.use('/api', createDiagnosisRoutes(deps.diagnosisController))

  if (deps.profileController) {
    // Rate limit dedicado para change-password: protege contra fuerza bruta con un access token robado
    const changePasswordLimiter = createRateLimiter({ windowMinutes: 15, maxRequests: 5 })
    app.use('/api/profile', createProfileRoutes(deps.profileController, changePasswordLimiter))
  }

  mountAdminRoutes(app, deps)

  mountErrorHandler(app, deps.logger)

  return app
}
