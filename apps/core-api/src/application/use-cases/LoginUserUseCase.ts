import type { UserRepository } from '@/application/ports/UserRepository.js'
import type { AuthServicePort } from '@/application/ports/AuthServicePort.js'
import type { RefreshTokenRepository } from '@/application/ports/RefreshTokenRepository.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import { persistRefreshToken } from '@/application/shared/hashToken.js'
import { loginUserSchema, type LoginUserInput } from '@/application/dto/LoginUserInput.js'
import type { LoginUserOutput } from '@/application/dto/LoginUserOutput.js'

/** Caso de uso: inicio de sesion. */
export class LoginUserUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly authService: AuthServicePort,
    private readonly tokenStore: RefreshTokenRepository,
    private readonly logger?: LoggerPort,
  ) {}

  async execute(input: LoginUserInput): Promise<LoginUserOutput> {
    const parsed = loginUserSchema.parse(input)

    const user = await this.userRepo.findByEmail(parsed.email)
    if (!user) {
      this.logger?.info('auth.login_failed', { email: parsed.email, reason: 'user_not_found' })
      throw new InvalidCredentialsError()
    }

    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      this.logger?.warn('auth.locked_out', { userId: user.id, lockedUntil: user.lockedUntil })
      throw new AccountLockedError()
    }

    const valid = await this.authService.comparePassword(parsed.password, user.passwordHash)
    if (!valid) {
      await this.userRepo.incrementFailedLogin(user.id)
      this.logger?.info('auth.login_failed', {
        userId: user.id,
        reason: 'wrong_password',
      })
      throw new InvalidCredentialsError()
    }

    // Login exitoso: resetear contador de fallos
    await this.userRepo.resetFailedLogins(user.id)

    const tokens = this.authService.generateTokens(user.id)
    await persistRefreshToken(this.tokenStore, user.id, tokens)

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

/** Error lanzado cuando la cuenta esta bloqueada por multiples intentos fallidos. */
export class AccountLockedError extends Error {
  constructor() {
    super('Account temporarily locked due to too many failed login attempts')
    this.name = 'AccountLockedError'
  }
}
