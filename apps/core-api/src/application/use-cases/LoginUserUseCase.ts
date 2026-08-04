import type { UserRepository } from '@/application/ports/UserRepository.js'
import type { AuthServicePort } from '@/application/ports/AuthServicePort.js'
import type { RefreshTokenRepository } from '@/application/ports/RefreshTokenRepository.js'
import { persistRefreshToken } from '@/application/shared/hashToken.js'
import {
  loginUserSchema,
  type LoginUserInput,
} from '@/application/dto/LoginUserInput.js'
import type { LoginUserOutput } from '@/application/dto/LoginUserOutput.js'

/** Caso de uso: inicio de sesion. */
export class LoginUserUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly authService: AuthServicePort,
    private readonly tokenStore: RefreshTokenRepository,
  ) {}

  async execute(input: LoginUserInput): Promise<LoginUserOutput> {
    const parsed = loginUserSchema.parse(input)

    const user = await this.userRepo.findByEmail(parsed.email)
    if (!user) {
      throw new InvalidCredentialsError()
    }

    const valid = await this.authService.comparePassword(parsed.password, user.passwordHash)
    if (!valid) {
      throw new InvalidCredentialsError()
    }

    const tokens = this.authService.generateTokens(user.id)
    await persistRefreshToken(this.tokenStore, user.id, tokens)

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
