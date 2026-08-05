import type { User } from '@/domain/entities/user.js'

/** Datos necesarios para crear un usuario (sin id, createdAt ni getters, que asigna la DB). */
export type CreateUserInput = Omit<User, 'id' | 'createdAt' | 'isWorkshop'>
