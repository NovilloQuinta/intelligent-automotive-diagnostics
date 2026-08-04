import { Router } from 'express'
import { AuthController } from '@/infrastructure/http/controllers/AuthController.js'

/** Define los endpoints de autenticacion. */
export function createAuthRoutes(controller: AuthController): Router {
  const router = Router()

  router.post('/register', controller.register)
  router.post('/login', controller.login)
  router.post('/refresh', controller.refresh)

  return router
}
