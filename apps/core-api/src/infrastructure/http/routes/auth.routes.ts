import { Router } from 'express'
import type { UserRepository } from '@/application/ports/UserRepository.js'
import type { AuthServicePort } from '@/application/ports/AuthServicePort.js'
import type { RefreshTokenRepository } from '@/application/ports/RefreshTokenRepository.js'
import { RegisterUserUseCase } from '@/application/use-cases/RegisterUserUseCase.js'
import { LoginUserUseCase } from '@/application/use-cases/LoginUserUseCase.js'
import { RefreshTokenUseCase } from '@/application/use-cases/RefreshTokenUseCase.js'
import { AuthController } from '@/infrastructure/http/controllers/AuthController.js'

/** Define los endpoints de autenticacion. */
export function createAuthRoutes(
  userRepo: UserRepository,
  authService: AuthServicePort,
  tokenStore: RefreshTokenRepository,
): Router {
  const router = Router()

  const controller = new AuthController(
    new RegisterUserUseCase(userRepo, authService, tokenStore),
    new LoginUserUseCase(userRepo, authService, tokenStore),
    new RefreshTokenUseCase(authService),
  )

  router.post('/register', controller.register)
  router.post('/login', controller.login)
  router.post('/refresh', controller.refresh)

  return router
}
