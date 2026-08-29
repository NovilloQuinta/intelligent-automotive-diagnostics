import { z } from 'zod'
import { strongPasswordSchema } from '@/application/shared/passwordPolicy.js'

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1).describe('Token de un solo uso enviado por correo'),
    newPassword: strongPasswordSchema.describe('Contrasena nueva. Debe cumplir la politica'),
  })
  .describe('Fijado de contrasena nueva a partir del token de recuperacion')

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
