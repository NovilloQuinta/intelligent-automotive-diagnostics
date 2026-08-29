import type { UserRepository } from '@/application/ports/UserRepository.js'
import type { AuthServicePort } from '@/application/ports/AuthServicePort.js'
import type { RefreshTokenRepository } from '@/application/ports/RefreshTokenRepository.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import { randomBytes } from 'node:crypto'
import { hashToken, persistRefreshToken } from '@/application/shared/hashToken.js'
import type { TwoFactorChallengeRepository } from '@/application/ports/TwoFactorChallengeRepository.js'
import { isAccountLocked } from '@/application/shared/accountLock.js'
import { loginUserSchema, type LoginUserInput } from '@/application/dto/auth/LoginUserInput.js'
import type { LoginUserOutput } from '@/application/dto/auth/LoginUserOutput.js'

/** Bytes del token de reto. 32 bytes son 256 bits: no se adivina. */
const CHALLENGE_TOKEN_BYTES = 32

/** Cableado del segundo factor. Ausente = la aplicacion no lo tiene montado. */
export interface TwoFactorLoginSupport {
  readonly challengeRepo: TwoFactorChallengeRepository
  /** Vida del reto en milisegundos. Corta: es un paso intermedio, no una sesion. */
  readonly challengeTtlMs: number
}

export interface LoginUserUseCaseOptions {
  readonly userRepo: UserRepository
  readonly authService: AuthServicePort
  readonly tokenStore: RefreshTokenRepository
  readonly refreshTokenTtlMs: number
  readonly logger?: LoggerPort
  readonly twoFactor?: TwoFactorLoginSupport
}

/** Valida email+contraseña; si el usuario tiene segundo factor configurado devuelve un reto en vez de tokens (ver LoginUserOutput). */
export class LoginUserUseCase {
  constructor(private readonly options: LoginUserUseCaseOptions) {}

  async execute(input: LoginUserInput): Promise<LoginUserOutput> {
    const { userRepo, authService, tokenStore, refreshTokenTtlMs, logger } = this.options
    const parsed = loginUserSchema.parse(input)

    const user = await userRepo.findByEmail(parsed.email)
    if (!user) {
      // Sin el email: es PII y los logs de auth se conservan y se agregan.
      logger?.info('auth.login_failed', { reason: 'user_not_found' })
      throw new InvalidCredentialsError()
    }

    if (isAccountLocked(user.lockedUntil)) {
      logger?.warn('auth.locked_out', { userId: user.id, lockedUntil: user.lockedUntil })
      throw new AccountLockedError(user.lockedUntil)
    }

    const valid = await authService.comparePassword(parsed.password, user.passwordHash)
    if (!valid) {
      await this.rejectWrongPassword(user.id)
    }

    await userRepo.resetFailedLogins(user.id)

    if (user.twoFactorEnabled) {
      return this.issueChallenge(user.id)
    }

    const tokens = authService.generateTokens(user.id)
    await persistRefreshToken(tokenStore, user.id, tokens, refreshTokenTtlMs)

    logger?.info('auth.login_success', { userId: user.id })

    return {
      twoFactorRequired: false,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    }
  }

  /**
   * Registra el intento fallido y lanza el error correspondiente: 423 si ese
   * intento deja la cuenta bloqueada (en vez de un 401 que no explica nada y
   * dejar el aviso para el intento siguiente), 401 en caso contrario.
   */
  private async rejectWrongPassword(userId: number): Promise<never> {
    const { userRepo, logger } = this.options
    const state = await userRepo.incrementFailedLogin(userId)
    logger?.info('auth.login_failed', {
      userId,
      reason: 'wrong_password',
      failedLoginAttempts: state.failedLoginAttempts,
    })
    if (isAccountLocked(state.lockedUntil)) {
      logger?.warn('auth.locked_out', { userId, lockedUntil: state.lockedUntil })
      throw new AccountLockedError(state.lockedUntil)
    }
    throw new InvalidCredentialsError()
  }

  /**
   * Emite el vale para el segundo paso.
   *
   * Se guarda **hasheado**, como los tokens de reseteo: quien lea la base no puede
   * canjear nada. Y se invalidan los retos anteriores del usuario, para que varios
   * intentos de login no dejen una coleccion de vales vivos a la vez.
   */
  private async issueChallenge(userId: number): Promise<LoginUserOutput> {
    const { logger, twoFactor } = this.options
    if (!twoFactor) {
      // Fallar cerrado: la alternativa seria entregar tokens saltandose el segundo
      // factor porque el cableado esta incompleto, que es peor que no dejar entrar.
      logger?.error('auth.two_factor_not_configured', { userId })
      throw new TwoFactorNotConfiguredError()
    }

    const { challengeRepo, challengeTtlMs } = twoFactor
    await challengeRepo.invalidateAllForUser(userId)

    const challengeToken = randomBytes(CHALLENGE_TOKEN_BYTES).toString('base64url')
    const expiresAt = new Date(Date.now() + challengeTtlMs).toISOString()
    await challengeRepo.save(userId, hashToken(challengeToken), expiresAt)

    logger?.info('auth.two_factor_challenge_issued', { userId })

    return { twoFactorRequired: true, challengeToken, expiresAt }
  }
}

/**
 * Error cuando un usuario tiene el segundo factor activo pero la aplicacion no
 * tiene montado el soporte para verificarlo. Es un fallo de despliegue, no del
 * usuario: se responde 500, no 401.
 */
export class TwoFactorNotConfiguredError extends Error {
  constructor() {
    super('Two-factor authentication is enabled for this account but not configured on the server')
    this.name = 'TwoFactorNotConfiguredError'
  }
}

/** Error lanzado cuando las credenciales son invalidas. */
export class InvalidCredentialsError extends Error {
  constructor() {
    super('Invalid credentials')
    this.name = 'InvalidCredentialsError'
  }
}

/**
 * Error lanzado cuando la cuenta esta bloqueada por multiples intentos fallidos.
 *
 * Lleva el instante de desbloqueo para que la capa HTTP pueda responder con
 * `Retry-After` y el cliente sepa cuanto falta, en vez de un "bloqueada" seco.
 */
export class AccountLockedError extends Error {
  /** Instante ISO-8601 en el que la cuenta se desbloquea, si se conoce. */
  readonly lockedUntil: string | null

  constructor(lockedUntil: string | null = null) {
    super('Account temporarily locked due to too many failed login attempts')
    this.name = 'AccountLockedError'
    this.lockedUntil = lockedUntil
  }

  /** Segundos que faltan para el desbloqueo, redondeados al alza. `null` si se desconoce. */
  get retryAfterSeconds(): number | null {
    if (!this.lockedUntil) return null
    const remainingMs = new Date(this.lockedUntil).getTime() - Date.now()
    return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0
  }
}
