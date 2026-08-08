import { z } from 'zod'

/** Esquema de validacion Zod para el input de registro. */
export const registerUserSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email().max(255),
  password: z
    .string()
    .min(8)
    .max(128)
    .regex(
      /^(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).*$/,
      'Password must contain at least 1 uppercase letter, 1 number, and 1 special character',
    ),
  userType: z.enum(['individual', 'workshop']),
  businessName: z.string().max(200).optional(),
  taxId: z.string().max(50).optional(),
  address: z.string().max(500).optional(),
})

/** Input del caso de uso RegisterUser. */
export type RegisterUserInput = z.infer<typeof registerUserSchema>
