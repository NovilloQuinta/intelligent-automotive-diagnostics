import type { Request, Response } from 'express'
import type { SetupTwoFactorUseCase } from '@/application/use-cases/SetupTwoFactorUseCase.js'
import { TwoFactorAlreadyEnabledError } from '@/application/use-cases/SetupTwoFactorUseCase.js'
import type { ActivateTwoFactorUseCase } from '@/application/use-cases/ActivateTwoFactorUseCase.js'
import { TwoFactorSetupMissingError } from '@/application/use-cases/ActivateTwoFactorUseCase.js'
import type { DisableTwoFactorUseCase } from '@/application/use-cases/DisableTwoFactorUseCase.js'
import { InvalidPasswordError } from '@/application/use-cases/DisableTwoFactorUseCase.js'
import type { VerifyTwoFactorUseCase } from '@/application/use-cases/VerifyTwoFactorUseCase.js'
import {
  InvalidTwoFactorChallengeError,
  InvalidTwoFactorCodeError,
} from '@/application/use-cases/VerifyTwoFactorUseCase.js'
import { AccountLockedError } from '@/application/use-cases/LoginUserUseCase.js'
import { respondIfValidationError, respondInternalError } from './httpErrors.js'

const ERROR_MESSAGES = {
  accessTokenRequired: 'Access token required',
  codeRequired: 'A two-factor code is required',
} as const

/** Casos de uso que consume {@link TwoFactorController}. */
export interface TwoFactorControllerUseCases {
  readonly setupTwoFactor: SetupTwoFactorUseCase
  readonly activateTwoFactor: ActivateTwoFactorUseCase
  readonly disableTwoFactor: DisableTwoFactorUseCase
  readonly verifyTwoFactor: VerifyTwoFactorUseCase
}

/** Extrae el `userId` del token, o responde 401. `null` significa "ya respondido". */
function requireUserId(req: Request, res: Response): number | null {
  if (typeof req.userId !== 'number') {
    res.status(401).json({ error: ERROR_MESSAGES.accessTokenRequired })
    return null
  }
  return req.userId
}

/** Lee una propiedad de texto del cuerpo, tolerando que no venga o no sea texto. */
function bodyString(req: Request, key: string): string {
  const value = (req.body as Record<string, unknown> | undefined)?.[key]
  return typeof value === 'string' ? value : ''
}

/** Responde 423 con `Retry-After` cuando la cuenta ha quedado bloqueada. */
function respondAccountLocked(err: AccountLockedError, res: Response): void {
  const retryAfterSeconds = err.retryAfterSeconds
  if (retryAfterSeconds !== null) res.setHeader('Retry-After', String(retryAfterSeconds))
  res.status(423).json({ error: err.message, lockedUntil: err.lockedUntil })
}

/**
 * Errores que se responden 401.
 *
 * El reto invalido tambien es 401 y no 400: es una credencial caducada, y lo que
 * toca es reiniciar el login, no corregir el cuerpo de la peticion.
 */
function isUnauthorizedError(err: unknown): err is Error {
  return (
    err instanceof InvalidTwoFactorChallengeError ||
    err instanceof InvalidTwoFactorCodeError ||
    err instanceof InvalidPasswordError
  )
}

/** Traduce a HTTP los errores comunes del segundo factor. `true` si ha respondido. */
function respondIfTwoFactorError(err: unknown, res: Response): boolean {
  if (err instanceof AccountLockedError) {
    respondAccountLocked(err, res)
    return true
  }
  if (isUnauthorizedError(err)) {
    res.status(401).json({ error: err.message })
    return true
  }
  return false
}

/** Controlador HTTP del segundo factor: alta, activacion, verificacion y baja. */
export class TwoFactorController {
  private readonly setupTwoFactor: SetupTwoFactorUseCase
  private readonly activateTwoFactor: ActivateTwoFactorUseCase
  private readonly disableTwoFactor: DisableTwoFactorUseCase
  private readonly verifyTwoFactor: VerifyTwoFactorUseCase

  constructor(useCases: TwoFactorControllerUseCases) {
    this.setupTwoFactor = useCases.setupTwoFactor
    this.activateTwoFactor = useCases.activateTwoFactor
    this.disableTwoFactor = useCases.disableTwoFactor
    this.verifyTwoFactor = useCases.verifyTwoFactor
  }

  /**
   * POST /api/auth/2fa/verify — segundo paso del login.
   *
   * 401 tanto si el reto no vale como si el codigo es incorrecto; 423 si la cuenta
   * quedo bloqueada por acumular fallos.
   */
  verify = async (req: Request, res: Response): Promise<void> => {
    try {
      res.status(200).json(await this.verifyTwoFactor.execute(req.body))
    } catch (err) {
      if (respondIfValidationError(err, res)) return
      if (respondIfTwoFactorError(err, res)) return
      respondInternalError(res)
    }
  }

  /**
   * POST /api/profile/2fa/setup — prepara el alta y devuelve el QR.
   *
   * `Cache-Control: no-store`: el cuerpo lleva el secreto en claro —es lo unico
   * que permite registrar la app— y no debe quedarse en ninguna cache intermedia.
   */
  setup = async (req: Request, res: Response): Promise<void> => {
    const userId = requireUserId(req, res)
    if (userId === null) return

    try {
      const result = await this.setupTwoFactor.execute(userId)
      res.setHeader('Cache-Control', 'no-store')
      res.status(200).json(result)
    } catch (err) {
      if (err instanceof TwoFactorAlreadyEnabledError) {
        res.status(409).json({ error: err.message })
        return
      }
      respondInternalError(res)
    }
  }

  /** POST /api/profile/2fa/activate — enciende el segundo factor y entrega los codigos. */
  activate = async (req: Request, res: Response): Promise<void> => {
    const userId = requireUserId(req, res)
    if (userId === null) return

    const code = bodyString(req, 'code')
    if (!code) {
      res.status(400).json({ error: ERROR_MESSAGES.codeRequired })
      return
    }

    try {
      const result = await this.activateTwoFactor.execute(userId, code)
      res.setHeader('Cache-Control', 'no-store')
      res.status(200).json(result)
    } catch (err) {
      this.respondActivateError(err, res)
    }
  }

  /** Cola de errores de `activate`, separada para que el handler quede en un vistazo. */
  private respondActivateError(err: unknown, res: Response): void {
    if (err instanceof TwoFactorSetupMissingError) {
      res.status(409).json({ error: err.message })
      return
    }
    if (respondIfTwoFactorError(err, res)) return
    respondInternalError(res)
  }

  /** POST /api/profile/2fa/disable — exige contrasena **y** codigo vigente. */
  disable = async (req: Request, res: Response): Promise<void> => {
    const userId = requireUserId(req, res)
    if (userId === null) return

    try {
      await this.disableTwoFactor.execute({
        userId,
        password: bodyString(req, 'password'),
        code: bodyString(req, 'code'),
      })
      res.status(200).json({ success: true })
    } catch (err) {
      if (respondIfValidationError(err, res)) return
      if (respondIfTwoFactorError(err, res)) return
      respondInternalError(res)
    }
  }
}
