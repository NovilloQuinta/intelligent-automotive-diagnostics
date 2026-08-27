import type { UserRepository } from '@/application/ports/UserRepository.js'
import type { TwoFactorRecoveryCodeRepository } from '@/application/ports/TwoFactorRecoveryCodeRepository.js'
import type { TotpPort } from '@/application/ports/TotpPort.js'
import type { SecretCipherPort } from '@/application/ports/SecretCipherPort.js'
import type { AuthServicePort } from '@/application/ports/AuthServicePort.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import { isTwoFactorCodeAccepted } from '@/application/shared/twoFactorCode.js'
import {
  InvalidTwoFactorCodeError,
  InvalidTwoFactorChallengeError,
} from '@/application/use-cases/VerifyTwoFactorUseCase.js'
import { NULL_LOGGER } from '@/application/shared/nullLogger.js'

/** Dependencias de la desactivacion del segundo factor. */
export interface DisableTwoFactorDeps {
  readonly userRepo: UserRepository
  readonly recoveryCodeRepo: TwoFactorRecoveryCodeRepository
  readonly totp: TotpPort
  readonly cipher: SecretCipherPort
  readonly authService: AuthServicePort
  readonly logger?: LoggerPort
}

/** Entrada de la desactivacion. */
export interface DisableTwoFactorInput {
  readonly userId: number
  readonly password: string
  /** Codigo TOTP o de recuperacion vigente. */
  readonly code: string
}

/**
 * Caso de uso: apagar el segundo factor.
 *
 * Exige **contrasena y codigo**, no solo la sesion iniciada. Si bastara con el
 * access token, un token robado —que es justo lo que el segundo factor viene a
 * cubrir— serviria para desactivarlo y quedarse dentro.
 *
 * Se admite un codigo de recuperacion para quien perdio el dispositivo: la
 * alternativa seria dejarle atrapado con la 2FA puesta.
 */
export class DisableTwoFactorUseCase {
  private readonly log: LoggerPort

  constructor(private readonly deps: DisableTwoFactorDeps) {
    this.log = deps.logger ?? NULL_LOGGER
  }

  async execute({ userId, password, code }: DisableTwoFactorInput): Promise<void> {
    const { userRepo, recoveryCodeRepo, authService } = this.deps

    const user = await userRepo.findById(userId)
    if (!user?.twoFactorEnabled) throw new InvalidTwoFactorChallengeError()

    if (!(await authService.comparePassword(password, user.passwordHash))) {
      this.log.warn('auth.two_factor_disable_rejected', { userId, reason: 'wrong_password' })
      throw new InvalidPasswordError()
    }

    if (!(await isTwoFactorCodeAccepted(this.deps, userId, code))) {
      this.log.warn('auth.two_factor_disable_rejected', { userId, reason: 'wrong_code' })
      throw new InvalidTwoFactorCodeError()
    }

    await userRepo.setTwoFactorEnabled(userId, false)
    await userRepo.saveTwoFactorSecret(userId, null)
    await recoveryCodeRepo.deleteAllForUser(userId)

    this.log.info('auth.two_factor_disabled', { userId })
  }
}

/** La contrasena presentada no coincide. */
export class InvalidPasswordError extends Error {
  constructor() {
    super('Invalid password')
    this.name = 'InvalidPasswordError'
  }
}
