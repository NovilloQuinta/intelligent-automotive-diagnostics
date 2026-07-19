import type { User, CreateUserInput } from '@/domain/entities/user.js'

/** Contrato para la persistencia de usuarios. */
export interface UserRepository {
  /** Busca un usuario por su email. */
  findByEmail(email: string): Promise<User | null>

  /** Busca un usuario por su ID. */
  findById(id: number): Promise<User | null>

  /** Crea un usuario nuevo. */
  create(input: CreateUserInput): Promise<User>
}
