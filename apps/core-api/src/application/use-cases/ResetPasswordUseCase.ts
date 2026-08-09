import type { PasswordResetTokenRepository } from '@/application/ports/PasswordResetTokenRepository.js'
import type { UserRepository } from '@/application/ports/UserRepository.js'
import type { AuthServicePort } from '@/application/ports/AuthServicePort.js'
import type { RefreshTokenRepository } from '@/application/ports/RefreshTokenRepository.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import { hashToken } from '@/application/shared/hashToken.js'
import {
  resetPasswordSchema,
  type ResetPasswordInput,
} from '@/application/dto/auth/ResetPasswordInput.js'

/** Caso de uso: reseteo de contraseña mediante un token de un solo uso. */
export class ResetPasswordUseCase {
  constructor(
    private readonly tokenRepo: PasswordResetTokenRepository,
    private readonly userRepo: UserRepository,
    private readonly authService: AuthServicePort,
    private readonly refreshTokenRepo: RefreshTokenRepository,
    private readonly logger?: LoggerPort,
  ) {}

  async execute(input: ResetPasswordInput): Promise<void> {
    const parsed = resetPasswordSchema.parse(input)

    const tokenHash = hashToken(parsed.token)
    const record = await this.tokenRepo.findByTokenHash(tokenHash)

    if (!record || record.usedAt !== null || new Date(record.expiresAt) < new Date()) {
      this.logger?.info('auth.reset_password_failed')
      throw new InvalidOrExpiredTokenError()
    }

    const passwordHash = await this.authService.hashPassword(parsed.newPassword)
    await this.userRepo.updatePassword(record.userId, passwordHash)
    await this.tokenRepo.markUsed(tokenHash)
    await this.refreshTokenRepo.revokeAllForUser(record.userId)
    await this.userRepo.resetFailedLogins(record.userId)

    this.logger?.info('auth.reset_password_success', { userId: record.userId })
  }
}

/** Error lanzado cuando el token de reseteo no existe, ha caducado o ya fue usado. */
export class InvalidOrExpiredTokenError extends Error {
  constructor() {
    super('Invalid or expired token')
    this.name = 'InvalidOrExpiredTokenError'
  }
}
