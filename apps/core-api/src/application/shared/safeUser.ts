import type { User } from '@/domain/entities/user.js'

/** Devuelve el usuario sin passwordHash, preservando campos derivados como isWorkshop. */
export function toSafeUser(user: User): Omit<User, 'passwordHash'> {
  const { passwordHash: _passwordHash, ...safeUser } = user
  return { ...safeUser, isWorkshop: user.isWorkshop }
}
