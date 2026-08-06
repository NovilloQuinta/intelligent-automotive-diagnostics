import type { User } from '@/domain/entities/user.js'
import type { CreateUserInput } from '@/application/dto/auth/CreateUserInput.js'

/** Contrato para la persistencia de usuarios. */
export interface UserRepository {
  /** Busca un usuario por su email. */
  findByEmail(email: string): Promise<User | null>

  /** Busca un usuario por su ID. */
  findById(id: number): Promise<User | null>

  /** Crea un usuario nuevo. */
  create(input: CreateUserInput): Promise<User>

  /** Incrementa el contador de intentos fallidos de login y bloquea si llega a 5. */
  incrementFailedLogin(userId: number): Promise<void>

  /** Resetea el contador de intentos fallidos tras login exitoso. */
  resetFailedLogins(userId: number): Promise<void>
}
