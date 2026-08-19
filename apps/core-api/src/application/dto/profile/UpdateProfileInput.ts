import { z } from 'zod'

/**
 * Esquema de validacion Zod para la edicion parcial de perfil.
 * `.strict()` rechaza cualquier campo no reconocido (en particular `email`, que
 * queda fuera de alcance de este endpoint) con un error 400 en vez de ignorarlo.
 */
export const updateProfileSchema = z
  .object({
    username: z.string().min(3).max(50).optional().describe('Nombre de usuario nuevo'),
    address: z.string().max(500).optional().describe('Direccion fiscal. Solo talleres'),
    businessName: z.string().max(200).optional().describe('Razon social. Solo talleres'),
    taxId: z.string().max(50).optional().describe('NIF o CIF. Solo talleres'),
  })
  .strict()
  .describe('Edicion parcial del perfil. `email` queda fuera de alcance y se rechaza con 400')

/** Input del caso de uso UpdateProfile. */
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>
