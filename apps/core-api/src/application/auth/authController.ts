import type { Request, Response } from 'express'
import { ZodError } from 'zod'
import {
  EmailAlreadyRegisteredError,
  type RegisterInput,
} from '@/application/use-cases/registerUser.js'
import { InvalidCredentialsError, type LoginInput } from '@/application/use-cases/loginUser.js'
import type { RefreshInput } from '@/application/use-cases/refreshToken.js'
import type { RegisterResult } from '@/application/use-cases/registerUser.js'
import type { LoginResult } from '@/application/use-cases/loginUser.js'
import type { RefreshResult } from '@/application/use-cases/refreshToken.js'

interface AuthControllerDeps {
  readonly registerUser: (input: RegisterInput) => Promise<RegisterResult>
  readonly loginUser: (input: LoginInput) => Promise<LoginResult>
  readonly refreshToken: (input: RefreshInput) => Promise<RefreshResult>
}

/** Crea un controlador HTTP de autenticacion que delega en los casos de uso. */
export function createAuthController(deps: AuthControllerDeps) {
  const { registerUser, loginUser, refreshToken } = deps

  return {
    async register(req: Request, res: Response): Promise<void> {
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
    },

    async login(req: Request, res: Response): Promise<void> {
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
    },

    async refresh(req: Request, res: Response): Promise<void> {
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
    },
  }
}
