import type { NextFunction, Request, Response } from 'express'
import {
  ChangePasswordUseCase,
  IncorrectCurrentPasswordError,
  SamePasswordError,
} from '@/application/use-cases/ChangePasswordUseCase.js'
import {
  UpdateProfileUseCase,
  UsernameAlreadyTakenError,
} from '@/application/use-cases/UpdateProfileUseCase.js'
import { UserNotFoundError } from '@/application/shared/UserNotFoundError.js'
import { respondIfValidationError, requireAuthenticatedUser } from './httpErrors.js'

/** Controlador HTTP para los endpoints de perfil autenticado (edicion y cambio de contraseña). */
export class ProfileController {
  constructor(
    private readonly changePasswordUseCase: ChangePasswordUseCase,
    private readonly updateProfileUseCase: UpdateProfileUseCase,
  ) {}

  changePassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = requireAuthenticatedUser(req, res)
    if (userId === null) return
    try {
      await this.changePasswordUseCase.execute(userId, req.body)
      res.status(200).json({ success: true })
    } catch (err) {
      if (respondIfValidationError(err, res)) return
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
      next(err)
    }
  }

  updateProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = requireAuthenticatedUser(req, res)
    if (userId === null) return
    try {
      const result = await this.updateProfileUseCase.execute(userId, req.body)
      res.status(200).json(result)
    } catch (err) {
      if (respondIfValidationError(err, res)) return
      if (err instanceof UsernameAlreadyTakenError) {
        res.status(409).json({ error: err.message })
        return
      }
      if (err instanceof UserNotFoundError) {
        res.status(404).json({ error: err.message })
        return
      }
      next(err)
    }
  }
}
