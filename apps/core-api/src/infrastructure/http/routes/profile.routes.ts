import { Router, type RequestHandler } from 'express'
import { ProfileController } from '@/infrastructure/http/controllers/ProfileController.js'

/**
 * Define los endpoints de perfil autenticado.
 * Se monta con el middleware `authenticateToken` obligatorio en el servidor
 * (a diferencia de auth.routes.ts, donde el guard por-ruta es opcional).
 */
export function createProfileRoutes(
  controller: ProfileController,
  changePasswordRateLimit?: RequestHandler,
): Router {
  const router = Router()

  router.patch('/', controller.updateProfile)
  router.post(
    '/change-password',
    ...([changePasswordRateLimit, controller.changePassword].filter(Boolean) as RequestHandler[]),
  )

  return router
}
