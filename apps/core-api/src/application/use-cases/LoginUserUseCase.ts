import type { UserRepository } from '@/application/ports/UserRepository.js'
import type { AuthServicePort } from '@/application/ports/AuthServicePort.js'
import type { RefreshTokenRepository } from '@/application/ports/RefreshTokenRepository.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import { persistRefreshToken } from '@/application/shared/hashToken.js'
import { loginUserSchema, type LoginUserInput } from '@/application/dto/auth/LoginUserInput.js'
import type { LoginUserOutput } from '@/application/dto/auth/LoginUserOutput.js'

/** Indica si `lockedUntil` marca un bloqueo todavia vigente. */
function isLocked(lockedUntil: string | null | undefined): lockedUntil is string {
  return !!lockedUntil && new Date(lockedUntil) > new Date()
}

/** Caso de uso: inicio de sesion. */
export class LoginUserUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly authService: AuthServicePort,
    private readonly tokenStore: RefreshTokenRepository,
    private readonly refreshTokenTtlMs: number,
    private readonly logger?: LoggerPort,
  ) {}

  async execute(input: LoginUserInput): Promise<LoginUserOutput> {
    const parsed = loginUserSchema.parse(input)

    const user = await this.userRepo.findByEmail(parsed.email)
    if (!user) {
      // Sin el email: es PII y los logs de auth se conservan y se agregan.
      this.logger?.info('auth.login_failed', { reason: 'user_not_found' })
      throw new InvalidCredentialsError()
    }

    if (isLocked(user.lockedUntil)) {
      this.logger?.warn('auth.locked_out', { userId: user.id, lockedUntil: user.lockedUntil })
      throw new AccountLockedError(user.lockedUntil)
    }

    const valid = await this.authService.comparePassword(parsed.password, user.passwordHash)
    if (!valid) {
      const state = await this.userRepo.incrementFailedLogin(user.id)
      this.logger?.info('auth.login_failed', {
        userId: user.id,
        reason: 'wrong_password',
        failedLoginAttempts: state.failedLoginAttempts,
      })
      // El intento que alcanza el umbral ya deja la cuenta bloqueada: se
      // responde 423 aqui mismo, en vez de un 401 que no explica nada y
      // dejar el aviso para el intento siguiente.
      if (isLocked(state.lockedUntil)) {
        this.logger?.warn('auth.locked_out', { userId: user.id, lockedUntil: state.lockedUntil })
        throw new AccountLockedError(state.lockedUntil)
      }
      throw new InvalidCredentialsError()
    }

    await this.userRepo.resetFailedLogins(user.id)

    const tokens = this.authService.generateTokens(user.id)
    await persistRefreshToken(this.tokenStore, user.id, tokens, this.refreshTokenTtlMs)

    this.logger?.info('auth.login_success', { userId: user.id })

    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }
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
