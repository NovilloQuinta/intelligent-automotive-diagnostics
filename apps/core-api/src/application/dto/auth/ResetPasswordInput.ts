import { z } from 'zod'
import { strongPasswordSchema } from '@/application/shared/passwordPolicy.js'

/** Esquema de validacion Zod para el input de reseteo de contraseña. */
export const resetPasswordSchema = z
  .object({
    token: z.string().min(1).describe('Token de un solo uso enviado por correo'),
    newPassword: strongPasswordSchema.describe('Contrasena nueva. Debe cumplir la politica'),
  })
  .describe('Fijado de contrasena nueva a partir del token de recuperacion')

/** Input del caso de uso ResetPassword. */
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
