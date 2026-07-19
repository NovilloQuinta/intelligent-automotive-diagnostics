import { Router } from 'express'
import type { UserRepository } from '@/application/ports/userRepository.interface.js'
import type { AuthService } from '@/infrastructure/auth/authService.js'
import type { RefreshTokenStore } from '@/infrastructure/auth/authService.js'
import { createAuthController } from '@/application/auth/authController.js'

/** Crea un Express Router con las rutas de autenticacion (/register, /login, /refresh). */
export function createAuthRoutes(
  userRepo: UserRepository,
  authService: AuthService,
  tokenStore: RefreshTokenStore,
): Router {
  const router = Router()
  const controller = createAuthController({ userRepo, authService, tokenStore })

  router.post('/register', controller.register)
  router.post('/login', controller.login)
  router.post('/refresh', controller.refresh)

  return router
}
