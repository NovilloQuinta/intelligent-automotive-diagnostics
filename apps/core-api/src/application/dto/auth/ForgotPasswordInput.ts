import { z } from 'zod'

export const forgotPasswordSchema = z
  .object({
    email: z.string().email().max(255).describe('Correo de la cuenta a recuperar'),
  })
  .describe('Solicitud de recuperacion. La respuesta es identica exista o no la cuenta')

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
