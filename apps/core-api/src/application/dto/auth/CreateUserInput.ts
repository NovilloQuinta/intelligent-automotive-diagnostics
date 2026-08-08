import type { User } from '@/domain/entities/user.js'

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
  'id' | 'createdAt' | 'isWorkshop' | 'isAdmin' | 'failedLoginAttempts' | 'lockedUntil' | 'role'
> & {
  role?: 'user' | 'admin'
}
