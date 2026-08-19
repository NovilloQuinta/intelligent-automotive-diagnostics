import { z } from 'zod'

/** Esquema de validacion Zod para el input de inicio de sesion. */
export const loginUserSchema = z
  .object({
    email: z.string().email().describe('Correo de la cuenta'),
    password: z.string().min(1).max(128).describe('Contrasena en claro, sobre HTTPS'),
  })
  .describe('Credenciales de inicio de sesion. A los 5 fallos la cuenta se bloquea 15 minutos')

/** Input del caso de uso LoginUser. */
export type LoginUserInput = z.infer<typeof loginUserSchema>
