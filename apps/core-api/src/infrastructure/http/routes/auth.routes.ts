import { Router, type RequestHandler } from 'express'
import { AuthController } from '@/infrastructure/http/controllers/AuthController.js'

/**
 * Define los endpoints de autenticacion.
 * GET /me se protege con middleware por ruta (el middleware global se monta despues de /api/auth).
 */
export function createAuthRoutes(controller: AuthController, requireAuth?: RequestHandler): Router {
  const router = Router()

  router.post('/register', controller.register)
  router.post('/login', controller.login)
  router.post('/refresh', controller.refresh)
  if (requireAuth) {
    router.get('/me', requireAuth, controller.me)
  }
  router.post('/logout', controller.logout)

  return router
}
