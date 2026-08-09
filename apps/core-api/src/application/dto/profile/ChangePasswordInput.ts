import { z } from 'zod'
import { strongPasswordSchema } from '@/application/shared/passwordPolicy.js'

/** Esquema de validacion Zod para el input de cambio de contraseña autenticado. */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: strongPasswordSchema,
})

/** Input del caso de uso ChangePassword. */
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
