import type { UserRepository } from '@/application/ports/UserRepository.js'
import type { User } from '@/domain/entities/user.js'
import { toSafeUser } from '@/application/shared/safeUser.js'

/** Error lanzado cuando el usuario autenticado no existe en el sistema. */
export class UserNotFoundError extends Error {
  constructor() {
    super('User not found')
    this.name = 'UserNotFoundError'
  }
}

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
