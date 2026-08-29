import type { UserRepository } from '@/application/ports/UserRepository.js'
import type { User } from '@/domain/entities/User.js'
import { toSafeUser } from '@/application/shared/safeUser.js'
import { UserNotFoundError } from '@/application/shared/UserNotFoundError.js'

/** Caso de uso: devuelve el usuario autenticado sin datos sensibles. */
export class GetCurrentUserUseCase {
  constructor(private readonly userRepo: UserRepository) {}

  async execute(userId: number): Promise<Omit<User, 'passwordHash'>> {
    const user = await this.userRepo.findById(userId)
    if (!user) {
      throw new UserNotFoundError()
    }

    return toSafeUser(user)
  }
}
