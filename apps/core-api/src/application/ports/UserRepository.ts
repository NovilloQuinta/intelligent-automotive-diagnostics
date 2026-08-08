import type { User } from '@/domain/entities/user.js'
import type { CreateUserInput } from '@/application/dto/auth/CreateUserInput.js'
import type { AdminUsersFilter } from '@/application/dto/admin/AdminUsersFilter.js'
import type { AdminListResult } from '@/application/dto/admin/AdminListResult.js'
import type { UserStats } from '@/application/dto/admin/UserStats.js'

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

  /**
   * Lista usuarios filtrados por `q` (email/username) y rango de fecha de registro,
   * paginados. Nunca incluye `passwordHash`: usa la misma proyeccion que `safeUser`.
   */
  list(filter: AdminUsersFilter): Promise<AdminListResult<Omit<User, 'passwordHash'>>>

  /** Resumen agregado de usuarios: totales por `userType` y por `role`. */
  stats(): Promise<UserStats>
}
