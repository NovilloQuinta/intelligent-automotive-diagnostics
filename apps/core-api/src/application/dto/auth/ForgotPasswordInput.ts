import { z } from 'zod'

/** Esquema de validacion Zod para el input de solicitud de reseteo de contraseña. */
export const forgotPasswordSchema = z.object({
  email: z.string().email().max(255),
})

/** Input del caso de uso ForgotPassword. */
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
