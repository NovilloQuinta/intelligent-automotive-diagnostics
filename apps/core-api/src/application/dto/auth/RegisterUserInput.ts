import { z } from 'zod'
import { strongPasswordSchema } from '@/application/shared/passwordPolicy.js'

export const registerUserSchema = z
  .object({
    username: z
      .string()
      .min(3)
      .max(50)
      .describe('Nombre de usuario, unico. Entre 3 y 50 caracteres'),
    email: z.string().email().max(255).describe('Correo electronico, unico. Sirve de credencial'),
    password: strongPasswordSchema.describe(
      'Contrasena. Debe cumplir la politica de robustez del proyecto',
    ),
    userType: z
      .enum(['individual', 'workshop'])
      .describe('Particular o taller. El taller habilita los campos de facturacion'),
    businessName: z.string().max(200).optional().describe('Razon social. Solo talleres'),
    taxId: z.string().max(50).optional().describe('NIF o CIF. Solo talleres'),
    address: z.string().max(500).optional().describe('Direccion fiscal. Solo talleres'),
  })
  .describe('Alta de una cuenta nueva')

export type RegisterUserInput = z.infer<typeof registerUserSchema>
