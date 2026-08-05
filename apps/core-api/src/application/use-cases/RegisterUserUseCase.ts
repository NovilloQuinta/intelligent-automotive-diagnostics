import type { UserRepository } from '@/application/ports/UserRepository.js'
import type { AuthServicePort } from '@/application/ports/AuthServicePort.js'
import type { RefreshTokenRepository } from '@/application/ports/RefreshTokenRepository.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import { Email } from '@/domain/value-objects/email.js'
import { persistRefreshToken } from '@/application/shared/hashToken.js'
import { toSafeUser } from '@/application/shared/safeUser.js'
import { registerUserSchema, type RegisterUserInput } from '@/application/dto/RegisterUserInput.js'
import type { RegisterUserOutput } from '@/application/dto/RegisterUserOutput.js'

/** Caso de uso: registro de usuario nuevo. */
export class RegisterUserUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly authService: AuthServicePort,
    private readonly tokenStore: RefreshTokenRepository,
    private readonly logger?: LoggerPort,
  ) {}

  async execute(input: RegisterUserInput): Promise<RegisterUserOutput> {
    const parsed = registerUserSchema.parse(input)

    const existing = await this.userRepo.findByEmail(parsed.email)
    if (existing) {
      throw new EmailAlreadyRegisteredError()
    }

    const passwordHash = await this.authService.hashPassword(parsed.password)
    const user = await this.userRepo.create({
      username: parsed.username,
      email: new Email(parsed.email),
      passwordHash,
      userType: parsed.userType,
      businessName: parsed.businessName ?? null,
      taxId: parsed.taxId ?? null,
      address: parsed.address ?? null,
    })

    const tokens = this.authService.generateTokens(user.id)
    await persistRefreshToken(this.tokenStore, user.id, tokens)

    this.logger?.info('auth.register', {
      userId: user.id,
      userType: parsed.userType,
      email: parsed.email,
    })

    return {
      user: toSafeUser(user),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    }
  }
}

/** Error lanzado cuando el email ya esta registrado. */
export class EmailAlreadyRegisteredError extends Error {
  constructor() {
    super('Email already registered')
    this.name = 'EmailAlreadyRegisteredError'
  }
}
