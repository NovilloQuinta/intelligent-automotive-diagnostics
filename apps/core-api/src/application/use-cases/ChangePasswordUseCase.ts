import type { UserRepository } from '@/application/ports/UserRepository.js'
import type { AuthServicePort } from '@/application/ports/AuthServicePort.js'
import type { RefreshTokenRepository } from '@/application/ports/RefreshTokenRepository.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import { UserNotFoundError } from '@/application/shared/UserNotFoundError.js'
import {
  changePasswordSchema,
  type ChangePasswordInput,
} from '@/application/dto/profile/ChangePasswordInput.js'

/** Requiere la contraseña actual, rechaza si es igual a la nueva, y revoca todas las sesiones activas tras el cambio. */
export class ChangePasswordUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly authService: AuthServicePort,
    private readonly refreshTokenRepo: RefreshTokenRepository,
    private readonly logger?: LoggerPort,
  ) {}

  async execute(userId: number, input: ChangePasswordInput): Promise<void> {
    const parsed = changePasswordSchema.parse(input)

    if (parsed.newPassword === parsed.currentPassword) {
      throw new SamePasswordError()
    }

    const user = await this.userRepo.findById(userId)
    if (!user) {
      throw new UserNotFoundError()
    }

    const valid = await this.authService.comparePassword(parsed.currentPassword, user.passwordHash)
    if (!valid) {
      this.logger?.info('profile.change_password_failed', { userId })
      throw new IncorrectCurrentPasswordError()
    }

    const passwordHash = await this.authService.hashPassword(parsed.newPassword)
    await this.userRepo.updatePassword(userId, passwordHash)
    await this.refreshTokenRepo.revokeAllForUser(userId)

    this.logger?.info('profile.change_password_success', { userId })
  }
}

/** Error lanzado cuando la contraseña actual no coincide. */
export class IncorrectCurrentPasswordError extends Error {
  constructor() {
    super('Current password is incorrect')
    this.name = 'IncorrectCurrentPasswordError'
  }
}

/** Error lanzado cuando la nueva contraseña es igual a la actual. */
export class SamePasswordError extends Error {
  constructor() {
    super('New password must be different from the current password')
    this.name = 'SamePasswordError'
  }
}
