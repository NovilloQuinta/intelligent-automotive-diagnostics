import { z } from 'zod'

/** Esquema de validacion Zod para el input de refresco de token. */
export const refreshTokenSchema = z
  .object({
    refreshToken: z.string().min(1).describe('JWT de refresco emitido en el login'),
  })
  .describe('Peticion de renovacion del token de acceso')

/** Input del caso de uso RefreshToken. */
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>
