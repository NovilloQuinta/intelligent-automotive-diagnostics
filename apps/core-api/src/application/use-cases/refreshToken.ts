import { z } from 'zod'
import type { AuthServicePort } from '@/application/ports/authService.port.js'

/** Esquema de validacion para el input de refresco de token. */
export const refreshInputSchema = z.object({
  refreshToken: z.string().min(1),
})

/** Tipo inferido del input de refresco. */
export type RefreshInput = z.infer<typeof refreshInputSchema>

/** Resultado devuelto por el caso de uso de refresco de token. */
export interface RefreshResult {
  readonly accessToken: string
  readonly refreshToken: string
}

/** Caso de uso: rotacion de refresh token.
 * Valida el token, lo revoca y emite un nuevo par.
 */
export function createRefreshTokenUseCase(deps: { readonly authService: AuthServicePort }) {
  const { authService } = deps

  return async function refreshToken(input: RefreshInput): Promise<RefreshResult> {
    const parsed = refreshInputSchema.parse(input)

    const tokens = await authService.refreshAccessToken(parsed.refreshToken)

    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }
  }
}
