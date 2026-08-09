import type { User } from '@/domain/entities/user.js'

/** Devuelve el usuario sin passwordHash, preservando campos derivados como isWorkshop. */
export function toSafeUser(user: User): Omit<User, 'passwordHash'> {
  const { passwordHash: _passwordHash, ...safeUser } = user
  return { ...safeUser, isWorkshop: user.isWorkshop, isAdmin: user.isAdmin }
}

/**
 * Quita `passwordHash` de un objeto que pueda tenerlo, sin exigir un {@link User}
 * completo. Ultima linea de defensa cuando el objeto de entrada ya deberia venir sin
 * el hash (p. ej. `UserRepository.list()`, que usa `safeUser` internamente), para que
 * un futuro cambio en el repositorio no pueda filtrarlo sin que ningun test lo note.
 */
export function stripPasswordHash<T extends Record<string, unknown>>(
  item: T,
): Omit<T, 'passwordHash'> {
  const { passwordHash: _passwordHash, ...rest } = item
  return rest
}
