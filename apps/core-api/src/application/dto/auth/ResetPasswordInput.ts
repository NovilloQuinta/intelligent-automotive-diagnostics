import { z } from 'zod'
import { strongPasswordSchema } from '@/application/shared/passwordPolicy.js'

/** Esquema de validacion Zod para el input de reseteo de contraseña. */
export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: strongPasswordSchema,
})

/** Input del caso de uso ResetPassword. */
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
