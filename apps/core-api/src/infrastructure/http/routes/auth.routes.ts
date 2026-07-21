import { Router } from 'express'
import type { Request, Response } from 'express'
import { ZodError } from 'zod'
import type { UserRepository } from '@/application/ports/userRepository.interface.js'
import type { AuthServicePort } from '@/application/ports/authService.interface.js'
import type { RefreshTokenStorePort } from '@/application/ports/refreshTokenStore.interface.js'
import {
  EmailAlreadyRegisteredError,
  createRegisterUserUseCase,
} from '@/application/use-cases/registerUser.js'
import {
  InvalidCredentialsError,
  createLoginUserUseCase,
} from '@/application/use-cases/loginUser.js'
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

  router.post('/register', async (req: Request, res: Response) => {
    try {
      const result = await registerUser(req.body)
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
      const result = await loginUser(req.body)
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
      const result = await refreshToken(req.body)
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
