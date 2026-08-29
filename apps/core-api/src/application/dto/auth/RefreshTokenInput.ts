import { z } from 'zod'

export const refreshTokenSchema = z
  .object({
    refreshToken: z.string().min(1).describe('JWT de refresco emitido en el login'),
  })
  .describe('Peticion de renovacion del token de acceso')

export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>
