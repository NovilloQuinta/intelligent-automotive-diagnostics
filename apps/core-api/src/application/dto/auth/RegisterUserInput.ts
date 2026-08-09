import { z } from 'zod'
import { strongPasswordSchema } from '@/application/shared/passwordPolicy.js'

/** Esquema de validacion Zod para el input de registro. */
export const registerUserSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email().max(255),
  password: strongPasswordSchema,
  userType: z.enum(['individual', 'workshop']),
  businessName: z.string().max(200).optional(),
  taxId: z.string().max(50).optional(),
  address: z.string().max(500).optional(),
})

/** Input del caso de uso RegisterUser. */
export type RegisterUserInput = z.infer<typeof registerUserSchema>
