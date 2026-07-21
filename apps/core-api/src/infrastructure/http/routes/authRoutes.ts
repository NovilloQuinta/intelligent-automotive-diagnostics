import { Router } from 'express'
import type { UserRepository } from '@/application/ports/userRepository.interface.js'
import type { AuthServicePort } from '@/application/ports/authService.interface.js'
import type { RefreshTokenStorePort } from '@/application/ports/refreshTokenStore.interface.js'
import { createAuthController } from '@/application/auth/authController.js'
import { createRegisterUserUseCase } from '@/application/use-cases/registerUser.js'
import { createLoginUserUseCase } from '@/application/use-cases/loginUser.js'
import { createRefreshTokenUseCase } from '@/application/use-cases/refreshToken.js'

/** Crea un Express Router con las rutas de autenticacion. */
export function createAuthRoutes(
  userRepo: UserRepository,
  authService: AuthServicePort,
  tokenStore: RefreshTokenStorePort,
): Router {
  const router = Router()

  const registerUser = createRegisterUserUseCase({ userRepo, authService, tokenStore })
  const loginUser = createLoginUserUseCase({ userRepo, authService, tokenStore })
  const refreshToken = createRefreshTokenUseCase({ authService })

  const controller = createAuthController({ registerUser, loginUser, refreshToken })

  router.post('/register', controller.register)
  router.post('/login', controller.login)
  router.post('/refresh', controller.refresh)

  return router
}
