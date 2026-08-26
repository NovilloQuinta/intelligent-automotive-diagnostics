import { Router, type RequestHandler } from 'express'
import type { TwoFactorController } from '@/infrastructure/http/controllers/TwoFactorController.js'

/** Encadena los middlewares opcionales delante del handler. */
function chain(...handlers: (RequestHandler | undefined)[]): RequestHandler[] {
  return handlers.filter(Boolean) as RequestHandler[]
}

/**
 * Rutas del segundo factor que **no** exigen sesion: se montan bajo `/api/auth/2fa`,
 * antes del middleware global de autenticacion, porque quien las usa todavia no
 * tiene tokens — para eso viene.
 */
export function createTwoFactorAuthRoutes(
  controller: TwoFactorController,
  verifyRateLimit?: RequestHandler,
): Router {
  const router = Router()
  router.post('/verify', ...chain(verifyRateLimit, controller.verify))
  return router
}

/**
 * Rutas del segundo factor que exigen sesion: se montan bajo `/api/profile/2fa`,
 * detras del middleware de autenticacion.
 */
export function createTwoFactorProfileRoutes(
  controller: TwoFactorController,
  disableRateLimit?: RequestHandler,
): Router {
  const router = Router()
  router.post('/setup', controller.setup)
  router.post('/activate', controller.activate)
  router.post('/disable', ...chain(disableRateLimit, controller.disable))
  return router
}
