import type { UserRepository } from '@/application/ports/UserRepository.js'
import type { TwoFactorRecoveryCodeRepository } from '@/application/ports/TwoFactorRecoveryCodeRepository.js'
import type { TotpPort } from '@/application/ports/TotpPort.js'
import type { SecretCipherPort } from '@/application/ports/SecretCipherPort.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import { hashToken } from '@/application/shared/hashToken.js'
import { isRecoveryCodeShaped, normalizeTwoFactorCode } from '@/domain/twoFactor.js'

/** Lo minimo que necesita {@link isTwoFactorCodeAccepted}. */
export interface TwoFactorCodeDeps {
  readonly userRepo: Pick<UserRepository, 'findTwoFactorSecret'>
  readonly recoveryCodeRepo: Pick<TwoFactorRecoveryCodeRepository, 'consume'>
  readonly totp: TotpPort
  readonly cipher: SecretCipherPort
  readonly logger?: LoggerPort
}

/**
 * Comprueba un codigo de segundo factor, sea TOTP o de recuperacion.
 *
 * Compartido por la verificacion del login y la desactivacion desde el perfil.
 * La regla DRY del proyecto pide tres repeticiones antes de extraer, pero esta es
 * la comprobacion que sostiene el segundo factor entero: dos copias que puedan
 * divergir valen menos que la regla.
 *
 * Un codigo de recuperacion valido **se consume aqui**: la comprobacion y el gasto
 * van juntos porque separarlos abriria una carrera entre dos peticiones simultaneas.
 */
export async function isTwoFactorCodeAccepted(
  deps: TwoFactorCodeDeps,
  userId: number,
  rawCode: string,
): Promise<boolean> {
  const code = normalizeTwoFactorCode(rawCode)

  if (isRecoveryCodeShaped(code)) {
    return deps.recoveryCodeRepo.consume(userId, hashToken(code))
  }

  const encrypted = await deps.userRepo.findTwoFactorSecret(userId)
  if (!encrypted) return false

  try {
    return deps.totp.verify(deps.cipher.decrypt(encrypted), code)
  } catch {
    // Secreto corrupto o cifrado con otra clave: es una verificacion fallida, no
    // un 500. El usuario ve "codigo incorrecto" y el log deja la pista.
    deps.logger?.error('auth.two_factor_secret_unreadable', { userId })
    return false
  }
}
