import { z } from 'zod'
import type { UserRepositoryPort } from '@/application/ports/userRepository.port.js'
import type { AuthServicePort, TokenPair } from '@/application/ports/authService.port.js'
import type { RefreshTokenRepositoryPort } from '@/application/ports/refreshTokenRepository.port.js'
import { persistRefreshToken } from '@/application/use-cases/hashToken.js'

/** Esquema de validacion para el input de inicio de sesion. */
export const loginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

/** Tipo inferido del input de inicio de sesion. */
export type LoginInput = z.infer<typeof loginInputSchema>

/** Resultado devuelto por el caso de uso de inicio de sesion. */
export type LoginResult = TokenPair

/** Caso de uso: inicio de sesion.
 * Valida input, verifica credenciales y genera tokens.
 */
export function createLoginUserUseCase(deps: {
  readonly userRepo: UserRepositoryPort
  readonly authService: AuthServicePort
  readonly tokenStore: RefreshTokenRepositoryPort
}) {
  const { userRepo, authService, tokenStore } = deps

  return async function loginUser(input: LoginInput): Promise<LoginResult> {
    const parsed = loginInputSchema.parse(input)

    const user = await userRepo.findByEmail(parsed.email)
    if (!user) {
      throw new InvalidCredentialsError()
    }

    const valid = await authService.comparePassword(parsed.password, user.passwordHash)
    if (!valid) {
      throw new InvalidCredentialsError()
    }

    const tokens = authService.generateTokens(user.id)
    await persistRefreshToken(tokenStore, user.id, tokens)

    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }
  }
}

/** Error lanzado cuando las credenciales son invalidas. */
export class InvalidCredentialsError extends Error {
  constructor() {
    super('Invalid credentials')
    this.name = 'InvalidCredentialsError'
  }
}
