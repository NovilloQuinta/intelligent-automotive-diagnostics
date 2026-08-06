import { z } from 'zod'

/** Esquema de validacion Zod para el input de inicio de sesion. */
export const loginUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
})

/** Input del caso de uso LoginUser. */
export type LoginUserInput = z.infer<typeof loginUserSchema>
