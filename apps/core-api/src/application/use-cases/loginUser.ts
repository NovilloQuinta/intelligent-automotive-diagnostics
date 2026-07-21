import { z } from 'zod'
import { createHash } from 'node:crypto'
import type { UserRepository } from '@/application/ports/userRepository.interface.js'
import type { AuthServicePort } from '@/application/ports/authService.interface.js'
import type { RefreshTokenStorePort } from '@/application/ports/refreshTokenStore.interface.js'

/** Esquema de validacion para el input de inicio de sesion. */
export const loginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

/** Tipo inferido del input de inicio de sesion. */
export type LoginInput = z.infer<typeof loginInputSchema>

/** Resultado devuelto por el caso de uso de inicio de sesion. */
export interface LoginResult {
  readonly accessToken: string
  readonly refreshToken: string
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Caso de uso: inicio de sesion.
 * Valida input, verifica credenciales y genera tokens.
 */
export function createLoginUserUseCase(deps: {
  readonly userRepo: UserRepository
  readonly authService: AuthServicePort
  readonly tokenStore: RefreshTokenStorePort
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
    const expiresAt = new Date(Date.now() + SEVEN_DAYS_MS).toISOString()
    const tokenHash = hashToken(tokens.refreshToken)
    await tokenStore.saveRefreshToken(user.id, tokenHash, expiresAt)

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
