import { z } from 'zod'

export const loginUserSchema = z
  .object({
    email: z.string().email().describe('Correo de la cuenta'),
    password: z.string().min(1).max(128).describe('Contrasena en claro, sobre HTTPS'),
    /**
     * Casilla "Recordarme" del login. Solo alarga la vida del refresh token: la
     * contrasena no se guarda en ninguna parte, ni aqui ni en el cliente.
     */
    rememberMe: z
      .boolean()
      .optional()
      .default(false)
      .describe('Mantener la sesion iniciada en este dispositivo'),
  })
  .describe('Credenciales de inicio de sesion. A los 5 fallos la cuenta se bloquea 15 minutos')

export type LoginUserInput = z.infer<typeof loginUserSchema>
