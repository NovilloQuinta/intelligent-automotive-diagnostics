import type { User } from '@/domain/entities/User.js'
import type { CreateUserInput } from '@/application/dto/auth/CreateUserInput.js'
import type { AdminUsersFilter } from '@/application/dto/admin/AdminUsersFilter.js'
import type { AdminListResult } from '@/application/dto/admin/AdminListResult.js'
import type { UserStats } from '@/application/dto/admin/UserStats.js'
import type { FailedLoginState } from '@/application/dto/auth/FailedLoginState.js'

/** Contrato para la persistencia de usuarios. */
export interface UserRepository {
  /** Busca un usuario por su email. */
  findByEmail(email: string): Promise<User | null>

  /** Busca un usuario por su ID. */
  findById(id: number): Promise<User | null>

  /** Crea un usuario nuevo. */
  create(input: CreateUserInput): Promise<User>

  /**
   * Incrementa el contador de intentos fallidos de login y bloquea si llega a 5.
   * Devuelve el estado ya persistido para que quien llama sepa si ese mismo
   * intento ha dejado la cuenta bloqueada.
   */
  incrementFailedLogin(userId: number): Promise<FailedLoginState>

  /** Resetea el contador de intentos fallidos tras login exitoso. */
  resetFailedLogins(userId: number): Promise<void>

  /** Actualiza el hash de contraseña de un usuario. */
  updatePassword(userId: number, passwordHash: string): Promise<void>

  /**
   * Devuelve el secreto TOTP **cifrado**, o `null` si el usuario no dio de alta el
   * segundo factor.
   *
   * Va por un metodo propio y no como campo de {@link User} para que no pueda
   * colarse en las proyecciones publicas: `toSafeUser` incluye por defecto todo lo
   * que la entidad tenga.
   */
  findTwoFactorSecret(userId: number): Promise<string | null>

  /** Guarda el secreto TOTP cifrado, o lo borra con `null`. No activa el segundo factor. */
  saveTwoFactorSecret(userId: number, encryptedSecret: string | null): Promise<void>

  /** Enciende o apaga el segundo factor. */
  setTwoFactorEnabled(userId: number, enabled: boolean): Promise<void>

  /** Actualiza parcialmente los datos de perfil de un usuario (nunca el email). */
  updateProfile(
    userId: number,
    patch: Partial<Pick<User, 'username' | 'address' | 'businessName' | 'taxId'>>,
  ): Promise<User>

  /** Indica si ya existe un usuario con ese username, opcionalmente excluyendo un userId. */
  existsByUsername(username: string, excludeUserId?: number): Promise<boolean>

  /**
   * Lista usuarios filtrados por `q` (email/username) y rango de fecha de registro,
   * paginados. Nunca incluye `passwordHash`: usa la misma proyeccion que `safeUser`.
   */
  list(filter: AdminUsersFilter): Promise<AdminListResult<Omit<User, 'passwordHash'>>>

  /** Resumen agregado de usuarios: totales por `userType` y por `role`. */
  stats(): Promise<UserStats>
}
