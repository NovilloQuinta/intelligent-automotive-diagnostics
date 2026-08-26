import type { UserRepository } from '@/application/ports/UserRepository.js'
import type { TwoFactorRecoveryCodeRepository } from '@/application/ports/TwoFactorRecoveryCodeRepository.js'
import type { TotpPort } from '@/application/ports/TotpPort.js'
import type { SecretCipherPort } from '@/application/ports/SecretCipherPort.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import { hashToken } from '@/application/shared/hashToken.js'
import { generateRecoveryCodes, normalizeTwoFactorCode } from '@/domain/twoFactor.js'
import { InvalidTwoFactorCodeError } from '@/application/use-cases/VerifyTwoFactorUseCase.js'
import { NULL_LOGGER } from '@/application/shared/nullLogger.js'

/** Dependencias de la activacion del segundo factor. */
export interface ActivateTwoFactorDeps {
  readonly userRepo: UserRepository
  readonly recoveryCodeRepo: TwoFactorRecoveryCodeRepository
  readonly totp: TotpPort
  readonly cipher: SecretCipherPort
  readonly logger?: LoggerPort
}

/** Resultado de la activacion. */
export interface ActivateTwoFactorOutput {
  /**
   * Los codigos de recuperacion, en claro.
   *
   * Es la **unica** vez que salen del servidor: a partir de aqui solo existen sus
   * hashes. La pantalla tiene que dejarlo claro al usuario.
   */
  readonly recoveryCodes: readonly string[]
}

/**
 * Caso de uso: encender el segundo factor tras comprobar que la app del usuario
 * genera codigos validos para el secreto que se preparo en el alta.
 */
export class ActivateTwoFactorUseCase {
  private readonly log: LoggerPort

  constructor(private readonly deps: ActivateTwoFactorDeps) {
    this.log = deps.logger ?? NULL_LOGGER
  }

  async execute(userId: number, code: string): Promise<ActivateTwoFactorOutput> {
    const { userRepo, recoveryCodeRepo, totp, cipher } = this.deps

    const encrypted = await userRepo.findTwoFactorSecret(userId)
    if (!encrypted) throw new TwoFactorSetupMissingError()

    if (!totp.verify(cipher.decrypt(encrypted), normalizeTwoFactorCode(code))) {
      this.log.info('auth.two_factor_activation_failed', { userId })
      throw new InvalidTwoFactorCodeError()
    }

    const recoveryCodes = generateRecoveryCodes()
    await recoveryCodeRepo.replaceAllForUser(
      userId,
      recoveryCodes.map((recoveryCode) => hashToken(normalizeTwoFactorCode(recoveryCode))),
    )
    await userRepo.setTwoFactorEnabled(userId, true)

    this.log.info('auth.two_factor_enabled', { userId })

    return { recoveryCodes }
  }
}

/** No hay secreto preparado: hay que pasar por el alta antes de activar. */
export class TwoFactorSetupMissingError extends Error {
  constructor() {
    super('Two-factor setup has not been started')
    this.name = 'TwoFactorSetupMissingError'
  }
}
