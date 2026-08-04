import { Router } from 'express'
import type { Request, Response } from 'express'
import { ZodError } from 'zod'
import type { UserRepository } from '@/application/ports/UserRepository.js'
import type { AuthServicePort } from '@/application/ports/AuthServicePort.js'
import type { RefreshTokenRepository } from '@/application/ports/RefreshTokenRepository.js'
import {
  RegisterUserUseCase,
  EmailAlreadyRegisteredError,
} from '@/application/use-cases/RegisterUserUseCase.js'
import {
  LoginUserUseCase,
  InvalidCredentialsError,
} from '@/application/use-cases/LoginUserUseCase.js'
import { RefreshTokenUseCase } from '@/application/use-cases/RefreshTokenUseCase.js'

/** Crea un Express Router con las rutas de autenticacion. */
export function createAuthRoutes(
  userRepo: UserRepository,
  authService: AuthServicePort,
  tokenStore: RefreshTokenRepository,
): Router {
  const router = Router()

  const registerUser = new RegisterUserUseCase(userRepo, authService, tokenStore)
  const loginUser = new LoginUserUseCase(userRepo, authService, tokenStore)
  const refreshToken = new RefreshTokenUseCase(authService)

  router.post('/register', async (req: Request, res: Response) => {
    try {
      const result = await registerUser.execute(req.body)
      res.status(201).json(result)
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.issues })
        return
      }
      if (err instanceof EmailAlreadyRegisteredError) {
        res.status(409).json({ error: err.message })
        return
      }
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  router.post('/login', async (req: Request, res: Response) => {
    try {
      const result = await loginUser.execute(req.body)
      res.status(200).json(result)
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.issues })
        return
      }
      if (err instanceof InvalidCredentialsError) {
        res.status(401).json({ error: err.message })
        return
      }
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  router.post('/refresh', async (req: Request, res: Response) => {
    try {
      const result = await refreshToken.execute(req.body)
      res.status(200).json(result)
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.issues })
        return
      }
      res.status(401).json({ error: 'Invalid refresh token' })
    }
  })

  return router
}
