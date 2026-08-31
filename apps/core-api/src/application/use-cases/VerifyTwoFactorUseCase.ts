import type { UserRepository } from '@/application/ports/UserRepository.js'
import type { AuthServicePort } from '@/application/ports/AuthServicePort.js'
import type { RefreshTokenRepository } from '@/application/ports/RefreshTokenRepository.js'
import type { TwoFactorChallengeRepository } from '@/application/ports/TwoFactorChallengeRepository.js'
import type { TwoFactorRecoveryCodeRepository } from '@/application/ports/TwoFactorRecoveryCodeRepository.js'
import type { TotpPort } from '@/application/ports/TotpPort.js'
import type { SecretCipherPort } from '@/application/ports/SecretCipherPort.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import type { TokenPair } from '@/application/dto/auth/TokenPair.js'
import type { TwoFactorChallengeRecord } from '@/application/dto/auth/TwoFactorChallengeRecord.js'
import { hashToken, persistRefreshToken } from '@/application/shared/hashToken.js'
import { resolveRefreshTtl } from '@/application/shared/rememberMeTtl.js'
import { isAccountLocked } from '@/application/shared/accountLock.js'
import { isTwoFactorCodeAccepted } from '@/application/shared/twoFactorCode.js'
import { NULL_LOGGER } from '@/application/shared/nullLogger.js'
import { AccountLockedError } from '@/application/use-cases/LoginUserUseCase.js'
import {
  verifyTwoFactorSchema,
  type VerifyTwoFactorInput,
} from '@/application/dto/auth/VerifyTwoFactorInput.js'

/** Dependencias del caso de uso. Objeto en vez de nueve parametros posicionales. */
export interface VerifyTwoFactorDeps {
  readonly userRepo: UserRepository
  readonly challengeRepo: TwoFactorChallengeRepository
  readonly recoveryCodeRepo: TwoFactorRecoveryCodeRepository
  readonly totp: TotpPort
  readonly cipher: SecretCipherPort
  readonly authService: AuthServicePort
  readonly tokenStore: RefreshTokenRepository
  readonly refreshTokenTtlMs: number
  /**
   * Vida del refresh token cuando el reto se emitio con "Recordarme". Ausente =
   * todas las sesiones duran `refreshTokenTtlMs`.
   */
  readonly rememberMeRefreshTokenTtlMs?: number
  readonly logger?: LoggerPort
}

/** Indica si el reto sigue siendo canjeable, estrechando el tipo si lo es. */
function isChallengeUsable(
  challenge: TwoFactorChallengeRecord | null,
): challenge is TwoFactorChallengeRecord {
  if (!challenge || challenge.usedAt) return false
  return new Date(challenge.expiresAt) > new Date()
}

/**
 * Caso de uso: segundo paso del inicio de sesion.
 *
 * Canjea el reto emitido por el login junto a un codigo —TOTP o de recuperacion—
 * por el par de tokens. Los fallos cuentan para el mismo bloqueo de cuenta que las
 * contrasenas incorrectas: sin eso, este paso seria un oraculo de seis digitos.
 */
export class VerifyTwoFactorUseCase {
  private readonly log: LoggerPort

  constructor(private readonly deps: VerifyTwoFactorDeps) {
    this.log = deps.logger ?? NULL_LOGGER
  }

  async execute(input: VerifyTwoFactorInput): Promise<TokenPair> {
    const parsed = verifyTwoFactorSchema.parse(input)
    const tokenHash = hashToken(parsed.challengeToken)

    const { userId, rememberMe } = await this.resolveChallenge(tokenHash)
    await this.assertUserEligible(userId)

    if (!(await isTwoFactorCodeAccepted(this.deps, userId, parsed.code))) {
      await this.registerFailure(userId)
    }

    await this.deps.challengeRepo.markUsed(tokenHash)
    await this.deps.userRepo.resetFailedLogins(userId)

    return this.issueTokens(userId, rememberMe)
  }

  /**
   * Resuelve a quien pertenece el reto y con que duracion de sesion se emitio,
   * exigiendo que siga siendo canjeable.
   *
   * Un reto invalido NO suma al contador de fallos: lo emite el servidor, asi que
   * fallar aqui no es alguien probando codigos contra una cuenta.
   *
   * La duracion sale del reto y no del cuerpo de la peticion: el usuario ya la
   * eligio al dar su contrasena, y el segundo paso no tiene por que poder
   * contradecir al primero.
   */
  private async resolveChallenge(
    tokenHash: string,
  ): Promise<{ userId: number; rememberMe: boolean }> {
    const challenge = await this.deps.challengeRepo.findByTokenHash(tokenHash)
    if (!isChallengeUsable(challenge)) {
      this.log.info('auth.two_factor_challenge_rejected')
      throw new InvalidTwoFactorChallengeError()
    }
    return { userId: challenge.userId, rememberMe: challenge.rememberMe }
  }

  /** Comprueba que el usuario sigue teniendo el segundo factor y no esta bloqueado. */
  private async assertUserEligible(userId: number): Promise<void> {
    const user = await this.deps.userRepo.findById(userId)
    if (!user?.twoFactorEnabled) {
      this.log.warn('auth.two_factor_challenge_stale', { userId })
      throw new InvalidTwoFactorChallengeError()
    }
    if (isAccountLocked(user.lockedUntil)) {
      this.log.warn('auth.locked_out', { userId, lockedUntil: user.lockedUntil })
      throw new AccountLockedError(user.lockedUntil)
    }
  }

  /** Suma el intento fallido y traduce el bloqueo resultante, si lo hay. */
  private async registerFailure(userId: number): Promise<never> {
    const state = await this.deps.userRepo.incrementFailedLogin(userId)
    this.log.info('auth.two_factor_failed', {
      userId,
      failedLoginAttempts: state.failedLoginAttempts,
    })

    if (isAccountLocked(state.lockedUntil)) {
      this.log.warn('auth.locked_out', { userId, lockedUntil: state.lockedUntil })
      throw new AccountLockedError(state.lockedUntil)
    }
    throw new InvalidTwoFactorCodeError()
  }

  /** Emite el par de tokens y persiste el hash del refresco. */
  private async issueTokens(userId: number, rememberMe: boolean): Promise<TokenPair> {
    const { authService, tokenStore, refreshTokenTtlMs, rememberMeRefreshTokenTtlMs } = this.deps
    const ttlMs = resolveRefreshTtl(rememberMe, refreshTokenTtlMs, rememberMeRefreshTokenTtlMs)
    const tokens = authService.generateTokens(userId, rememberMe)
    await persistRefreshToken(tokenStore, userId, tokens, ttlMs)

    this.log.info('auth.two_factor_success', { userId, rememberMe })

    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }
  }
}

/** El reto no existe, ya se canjeo o caduco: hay que volver a iniciar sesion. */
export class InvalidTwoFactorChallengeError extends Error {
  constructor() {
    super('Invalid or expired two-factor challenge')
    this.name = 'InvalidTwoFactorChallengeError'
  }
}

/** El codigo presentado no es valido. El reto sigue vivo para reintentar. */
export class InvalidTwoFactorCodeError extends Error {
  constructor() {
    super('Invalid two-factor code')
    this.name = 'InvalidTwoFactorCodeError'
  }
}
