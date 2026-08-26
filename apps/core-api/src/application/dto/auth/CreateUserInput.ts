import type { User } from '@/domain/entities/User.js'

/**
 * Datos necesarios para crear un usuario (sin id, createdAt, getters ni campos
 * de seguridad gestionados por el sistema).
 *
 * `role` es opcional: por defecto el usuario se crea como `'user'` (ver
 * {@link toCreateValues}); el seed de administrador es el unico caller que lo
 * pasa explicitamente como `'admin'`.
 */
export type CreateUserInput = Omit<
  User,
  | 'id'
  | 'createdAt'
  | 'isWorkshop'
  | 'isAdmin'
  | 'failedLoginAttempts'
  | 'lockedUntil'
  | 'role'
  // El segundo factor nunca se elige al crear la cuenta: se da de alta despues,
  // desde el perfil, y en dos pasos.
  | 'twoFactorEnabled'
> & {
  role?: 'user' | 'admin'
}
