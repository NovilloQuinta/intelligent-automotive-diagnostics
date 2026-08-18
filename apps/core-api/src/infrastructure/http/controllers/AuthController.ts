import type { Request, Response } from 'express'
import {
  RegisterUserUseCase,
  EmailAlreadyRegisteredError,
} from '@/application/use-cases/RegisterUserUseCase.js'
import {
  LoginUserUseCase,
  InvalidCredentialsError,
  AccountLockedError,
} from '@/application/use-cases/LoginUserUseCase.js'
import { RefreshTokenUseCase } from '@/application/use-cases/RefreshTokenUseCase.js'
import {
  GetCurrentUserUseCase,
  UserNotFoundError,
} from '@/application/use-cases/GetCurrentUserUseCase.js'
import { LogoutUserUseCase } from '@/application/use-cases/LogoutUserUseCase.js'
import { ForgotPasswordUseCase } from '@/application/use-cases/ForgotPasswordUseCase.js'
import {
  ResetPasswordUseCase,
  InvalidOrExpiredTokenError,
} from '@/application/use-cases/ResetPasswordUseCase.js'
import { respondIfValidationError, respondInternalError } from './httpErrors.js'

const GENERIC_FORGOT_PASSWORD_MESSAGE = 'If that email exists, a reset link has been sent.'

const ERROR_MESSAGES = {
  invalidRefreshToken: 'Invalid refresh token',
  accessTokenRequired: 'Access token required',
} as const

/** Casos de uso que consume {@link AuthController}. */
export interface AuthControllerUseCases {
  readonly registerUser: RegisterUserUseCase
  readonly loginUser: LoginUserUseCase
  readonly refreshToken: RefreshTokenUseCase
  readonly getCurrentUser: GetCurrentUserUseCase
  readonly logoutUser: LogoutUserUseCase
  readonly forgotPassword: ForgotPasswordUseCase
  readonly resetPassword: ResetPasswordUseCase
}

/** Controlador HTTP para los endpoints de autenticacion. */
export class AuthController {
  private readonly registerUser: RegisterUserUseCase
  private readonly loginUser: LoginUserUseCase
  private readonly refreshToken: RefreshTokenUseCase
  private readonly getCurrentUser: GetCurrentUserUseCase
  private readonly logoutUser: LogoutUserUseCase
  private readonly forgotPasswordUseCase: ForgotPasswordUseCase
  private readonly resetPasswordUseCase: ResetPasswordUseCase

  constructor(useCases: AuthControllerUseCases) {
    this.registerUser = useCases.registerUser
    this.loginUser = useCases.loginUser
    this.refreshToken = useCases.refreshToken
    this.getCurrentUser = useCases.getCurrentUser
    this.logoutUser = useCases.logoutUser
    this.forgotPasswordUseCase = useCases.forgotPassword
    this.resetPasswordUseCase = useCases.resetPassword
  }

  /** POST /api/auth/register — alta de usuario. 400 validacion, 409 email ya registrado. */
  register = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.registerUser.execute(req.body)
      res.status(201).json(result)
    } catch (err) {
      if (respondIfValidationError(err, res)) return
      if (err instanceof EmailAlreadyRegisteredError) {
        res.status(409).json({ error: err.message })
        return
      }
      respondInternalError(res)
    }
  }

  /** POST /api/auth/login — 400 validacion, 401 credenciales invalidas. */
  login = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.loginUser.execute(req.body)
      res.status(200).json(result)
    } catch (err) {
      if (respondIfValidationError(err, res)) return
      if (err instanceof InvalidCredentialsError) {
        res.status(401).json({ error: err.message })
        return
      }
      if (err instanceof AccountLockedError) {
        // 423 Locked: la cuenta existe y las credenciales pueden ser correctas,
        // pero esta bloqueada por intentos fallidos. Sin esta rama caia en 500.
        const retryAfterSeconds = err.retryAfterSeconds
        if (retryAfterSeconds !== null) res.setHeader('Retry-After', String(retryAfterSeconds))
        res.status(423).json({
          error: err.message,
          lockedUntil: err.lockedUntil,
          retryAfterSeconds,
        })
        return
      }
      respondInternalError(res)
    }
  }

  /** POST /api/auth/refresh — 400 validacion, 401 cualquier otro fallo del token. */
  refresh = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.refreshToken.execute(req.body)
      res.status(200).json(result)
    } catch (err) {
      if (respondIfValidationError(err, res)) return
      res.status(401).json({ error: ERROR_MESSAGES.invalidRefreshToken })
    }
  }

  /** GET /api/auth/me — 401 sin token valido, 404 usuario inexistente. */
  me = async (req: Request, res: Response): Promise<void> => {
    try {
      if (typeof req.userId !== 'number') {
        res.status(401).json({ error: ERROR_MESSAGES.accessTokenRequired })
        return
      }
      const user = await this.getCurrentUser.execute(req.userId)
      res.status(200).json(user)
    } catch (err) {
      if (err instanceof UserNotFoundError) {
        res.status(404).json({ error: err.message })
        return
      }
      respondInternalError(res)
    }
  }

  /** POST /api/auth/logout — revoca el refresh token. 400 validacion. */
  logout = async (req: Request, res: Response): Promise<void> => {
    try {
      await this.logoutUser.execute(req.body)
      res.status(200).json({ success: true })
    } catch (err) {
      if (respondIfValidationError(err, res)) return
      respondInternalError(res)
    }
  }

  /**
   * Solicita un reseteo de contraseña. Responde siempre con el mismo mensaje generico
   * (anti-enumeracion de usuarios), independientemente de si el email existe o no.
   */
  forgotPassword = async (req: Request, res: Response): Promise<void> => {
    try {
      await this.forgotPasswordUseCase.execute(req.body)
      res.status(200).json({ message: GENERIC_FORGOT_PASSWORD_MESSAGE })
    } catch (err) {
      if (respondIfValidationError(err, res)) return
      respondInternalError(res)
    }
  }

  resetPassword = async (req: Request, res: Response): Promise<void> => {
    try {
      await this.resetPasswordUseCase.execute(req.body)
      res.status(200).json({ success: true })
    } catch (err) {
      if (respondIfValidationError(err, res)) return
      if (err instanceof InvalidOrExpiredTokenError) {
        res.status(400).json({ error: err.message })
        return
      }
      respondInternalError(res)
    }
  }
}
