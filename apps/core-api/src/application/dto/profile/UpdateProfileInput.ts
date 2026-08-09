import { z } from 'zod'

/**
 * Esquema de validacion Zod para la edicion parcial de perfil.
 * `.strict()` rechaza cualquier campo no reconocido (en particular `email`, que
 * queda fuera de alcance de este endpoint) con un error 400 en vez de ignorarlo.
 */
export const updateProfileSchema = z
  .object({
    username: z.string().min(3).max(50).optional(),
    address: z.string().max(500).optional(),
    businessName: z.string().max(200).optional(),
    taxId: z.string().max(50).optional(),
  })
  .strict()

/** Input del caso de uso UpdateProfile. */
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>
