import { z } from 'zod'
import type { UserRepositoryPort } from '@/application/ports/userRepository.port.js'
import type { AuthServicePort, TokenPair } from '@/application/ports/authService.port.js'
import type { RefreshTokenRepositoryPort } from '@/application/ports/refreshTokenRepository.port.js'
import type { User } from '@/domain/user.js'
import { persistRefreshToken } from '@/application/use-cases/hashToken.js'

/** Esquema de validacion para el input de registro. */
export const registerInputSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  userType: z.enum(['individual', 'workshop']),
  businessName: z.string().max(200).optional(),
  taxId: z.string().max(50).optional(),
  address: z.string().max(500).optional(),
})

/** Tipo inferido del input de registro. */
export type RegisterInput = z.infer<typeof registerInputSchema>

/** Resultado devuelto por el caso de uso de registro. */
export interface RegisterResult extends TokenPair {
  readonly user: Omit<User, 'passwordHash'>
}

/** Caso de uso: registro de usuario nuevo.
 * Valida input, comprueba duplicados, crea usuario y genera tokens.
 */
export function createRegisterUserUseCase(deps: {
  readonly userRepo: UserRepositoryPort
  readonly authService: AuthServicePort
  readonly tokenStore: RefreshTokenRepositoryPort
}) {
  const { userRepo, authService, tokenStore } = deps

  return async function registerUser(input: RegisterInput): Promise<RegisterResult> {
    const parsed = registerInputSchema.parse(input)

    const existing = await userRepo.findByEmail(parsed.email)
    if (existing) {
      throw new EmailAlreadyRegisteredError(parsed.email)
    }

    const passwordHash = await authService.hashPassword(parsed.password)
    const user = await userRepo.create({
      username: parsed.username,
      email: parsed.email,
      passwordHash,
      userType: parsed.userType,
      businessName: parsed.businessName ?? null,
      taxId: parsed.taxId ?? null,
      address: parsed.address ?? null,
    })

    const tokens = authService.generateTokens(user.id)
    await persistRefreshToken(tokenStore, user.id, tokens)

    const { passwordHash: _, ...safeUser } = user
    return { user: safeUser, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }
  }
}

/** Error lanzado cuando el email ya esta registrado. */
export class EmailAlreadyRegisteredError extends Error {
  constructor(email: string) {
    super(`Email already registered: ${email}`)
    this.name = 'EmailAlreadyRegisteredError'
  }
}
