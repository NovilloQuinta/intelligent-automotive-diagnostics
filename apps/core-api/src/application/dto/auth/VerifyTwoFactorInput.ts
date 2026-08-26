import { z } from 'zod'

/** Schema de entrada de la verificacion del segundo factor. */
export const verifyTwoFactorSchema = z.object({
  /** Token de reto entregado por el login, en claro. */
  challengeToken: z.string().min(1),
  /**
   * Codigo TOTP o de recuperacion. Se acepta con espacios y guiones porque es lo
   * que el usuario copia de su app o de su papel; se normaliza antes de comparar.
   */
  code: z.string().min(1).max(32),
})

/** Input del caso de uso VerifyTwoFactor. */
export type VerifyTwoFactorInput = z.infer<typeof verifyTwoFactorSchema>
