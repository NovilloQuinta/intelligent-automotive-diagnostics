import type { User } from '@/domain/entities/user.js'
import type { CreateUserInput } from '@/application/dto/CreateUserInput.js'

/** Contrato para la persistencia de usuarios. */
export interface UserRepository {
  /** Busca un usuario por su email. */
  findByEmail(email: string): Promise<User | null>

  /** Busca un usuario por su ID. */
  findById(id: number): Promise<User | null>

  /** Crea un usuario nuevo. */
  create(input: CreateUserInput): Promise<User>
}
