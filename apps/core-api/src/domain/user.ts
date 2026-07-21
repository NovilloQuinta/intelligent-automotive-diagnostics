/** Usuario de la aplicacion (particular o taller). */
export interface User {
  readonly id: number
  readonly username: string
  readonly email: string
  readonly passwordHash: string
  readonly userType: 'individual' | 'workshop'
  readonly businessName?: string | null
  readonly taxId?: string | null
  readonly address?: string | null
  readonly createdAt: string
}

/** Datos necesarios para crear un usuario (sin id ni createdAt, que asigna la DB). */
export type CreateUserInput = Omit<User, 'id' | 'createdAt'>
