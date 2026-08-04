import type { Request, Response } from 'express'
import { ZodError } from 'zod'
import {
  RegisterUserUseCase,
  EmailAlreadyRegisteredError,
} from '@/application/use-cases/RegisterUserUseCase.js'
import {
  LoginUserUseCase,
  InvalidCredentialsError,
} from '@/application/use-cases/LoginUserUseCase.js'
import { RefreshTokenUseCase } from '@/application/use-cases/RefreshTokenUseCase.js'

/** Controlador HTTP para los endpoints de autenticacion. */
export class AuthController {
  constructor(
    private readonly registerUser: RegisterUserUseCase,
    private readonly loginUser: LoginUserUseCase,
    private readonly refreshToken: RefreshTokenUseCase,
  ) {}

  register = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.registerUser.execute(req.body)
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
  }

  login = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.loginUser.execute(req.body)
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
  }

  refresh = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.refreshToken.execute(req.body)
      res.status(200).json(result)
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.issues })
        return
      }
      res.status(401).json({ error: 'Invalid refresh token' })
    }
  }
}
