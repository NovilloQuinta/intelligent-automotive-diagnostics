import type { User } from '@/domain/entities/user.js'

/** Datos necesarios para crear un usuario (sin id, createdAt, getters ni campos de seguridad gestionados por el sistema). */
export type CreateUserInput = Omit<
  User,
  'id' | 'createdAt' | 'isWorkshop' | 'failedLoginAttempts' | 'lockedUntil'
>
