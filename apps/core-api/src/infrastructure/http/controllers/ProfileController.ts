import type { Request, Response } from 'express'
import { ZodError } from 'zod'
import {
  ChangePasswordUseCase,
  IncorrectCurrentPasswordError,
  SamePasswordError,
} from '@/application/use-cases/ChangePasswordUseCase.js'
import {
  UpdateProfileUseCase,
  UsernameAlreadyTakenError,
} from '@/application/use-cases/UpdateProfileUseCase.js'
import { UserNotFoundError } from '@/application/use-cases/GetCurrentUserUseCase.js'

/** Controlador HTTP para los endpoints de perfil autenticado (edicion y cambio de contraseña). */
export class ProfileController {
  constructor(
    private readonly changePasswordUseCase: ChangePasswordUseCase,
    private readonly updateProfileUseCase: UpdateProfileUseCase,
  ) {}

  changePassword = async (req: Request, res: Response): Promise<void> => {
    try {
      if (typeof req.userId !== 'number') {
        res.status(401).json({ error: 'Access token required' })
        return
      }
      await this.changePasswordUseCase.execute(req.userId, req.body)
      res.status(200).json({ success: true })
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.issues })
        return
      }
      if (err instanceof IncorrectCurrentPasswordError) {
        res.status(401).json({ error: err.message })
        return
      }
      if (err instanceof SamePasswordError) {
        res.status(400).json({ error: err.message })
        return
      }
      if (err instanceof UserNotFoundError) {
        res.status(404).json({ error: err.message })
        return
      }
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  updateProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      if (typeof req.userId !== 'number') {
        res.status(401).json({ error: 'Access token required' })
        return
      }
      const result = await this.updateProfileUseCase.execute(req.userId, req.body)
      res.status(200).json(result)
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.issues })
        return
      }
      if (err instanceof UsernameAlreadyTakenError) {
        res.status(409).json({ error: err.message })
        return
      }
      if (err instanceof UserNotFoundError) {
        res.status(404).json({ error: err.message })
        return
      }
      res.status(500).json({ error: 'Internal server error' })
    }
  }
}
