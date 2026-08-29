import { z } from 'zod'

export const verifyTwoFactorSchema = z
  .object({
    challengeToken: z
      .string()
      .min(1)
      .describe('Vale de un solo uso que devolvio `POST /api/auth/login`'),
    /**
     * Se acepta con espacios y guiones porque es lo que el usuario copia de su app
     * o de su papel; se normaliza antes de comparar.
     */
    code: z.string().min(1).max(32).describe('Codigo TOTP de seis digitos, o uno de recuperacion'),
  })
  .describe('Segundo paso del inicio de sesion')

export type VerifyTwoFactorInput = z.infer<typeof verifyTwoFactorSchema>
