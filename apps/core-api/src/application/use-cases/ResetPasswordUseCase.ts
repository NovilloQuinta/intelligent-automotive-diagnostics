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

export interface ResetPasswordUseCaseOptions {
  readonly tokenRepo: PasswordResetTokenRepository
  readonly userRepo: UserRepository
  readonly authService: AuthServicePort
  readonly refreshTokenRepo: RefreshTokenRepository
  readonly logger?: LoggerPort
}

/** Valida el token de un solo uso (caducidad/uso previo), fija la contraseña nueva y revoca todas las sesiones activas del usuario. */
export class ResetPasswordUseCase {
  constructor(private readonly options: ResetPasswordUseCaseOptions) {}

  async execute(input: ResetPasswordInput): Promise<void> {
    const { tokenRepo, userRepo, authService, refreshTokenRepo, logger } = this.options
    const parsed = resetPasswordSchema.parse(input)

    const tokenHash = hashToken(parsed.token)
    const record = await tokenRepo.findByTokenHash(tokenHash)

    if (!record || record.usedAt !== null || new Date(record.expiresAt) < new Date()) {
      logger?.info('auth.reset_password_failed')
      throw new InvalidOrExpiredTokenError()
    }

    const passwordHash = await authService.hashPassword(parsed.newPassword)
    await userRepo.updatePassword(record.userId, passwordHash)
    await tokenRepo.markUsed(tokenHash)
    await refreshTokenRepo.revokeAllForUser(record.userId)
    await userRepo.resetFailedLogins(record.userId)

    logger?.info('auth.reset_password_success', { userId: record.userId })
  }
}

/** Error lanzado cuando el token de reseteo no existe, ha caducado o ya fue usado. */
export class InvalidOrExpiredTokenError extends Error {
  constructor() {
    super('Invalid or expired token')
    this.name = 'InvalidOrExpiredTokenError'
  }
}
