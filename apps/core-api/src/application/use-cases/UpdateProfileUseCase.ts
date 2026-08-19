import type { UserRepository } from '@/application/ports/UserRepository.js'
import type { User } from '@/domain/entities/User.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import { UserNotFoundError } from '@/application/use-cases/GetCurrentUserUseCase.js'
import { toSafeUser } from '@/application/shared/safeUser.js'
import {
  updateProfileSchema,
  type UpdateProfileInput,
} from '@/application/dto/profile/UpdateProfileInput.js'

const UNIQUE_USERNAME_CONSTRAINT = 'users.username'

/** Caso de uso: edicion parcial de perfil (username, address, businessName, taxId). */
export class UpdateProfileUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly logger?: LoggerPort,
  ) {}

  async execute(userId: number, input: UpdateProfileInput): Promise<Omit<User, 'passwordHash'>> {
    const parsed = updateProfileSchema.parse(input)

    const user = await this.userRepo.findById(userId)
    if (!user) {
      throw new UserNotFoundError()
    }

    if (parsed.username !== undefined) {
      const taken = await this.userRepo.existsByUsername(parsed.username, userId)
      if (taken) {
        throw new UsernameAlreadyTakenError()
      }
    }

    try {
      const updated = await this.userRepo.updateProfile(userId, parsed)
      this.logger?.info('profile.update_success', { userId })
      return toSafeUser(updated)
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      if (message.includes(UNIQUE_USERNAME_CONSTRAINT)) {
        throw new UsernameAlreadyTakenError()
      }
      throw err
    }
  }
}

/** Error lanzado cuando el username ya esta en uso por otro usuario. */
export class UsernameAlreadyTakenError extends Error {
  constructor() {
    super('Username already taken')
    this.name = 'UsernameAlreadyTakenError'
  }
}
