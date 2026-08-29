import type { UserRepository } from '@/application/ports/UserRepository.js'
import type { AuthServicePort } from '@/application/ports/AuthServicePort.js'
import type { RefreshTokenRepository } from '@/application/ports/RefreshTokenRepository.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import { Email } from '@/domain/value-objects/Email.js'
import { persistRefreshToken } from '@/application/shared/hashToken.js'
import { toSafeUser } from '@/application/shared/safeUser.js'
import {
  registerUserSchema,
  type RegisterUserInput,
} from '@/application/dto/auth/RegisterUserInput.js'
import type { RegisterUserOutput } from '@/application/dto/auth/RegisterUserOutput.js'

export interface RegisterUserUseCaseOptions {
  readonly userRepo: UserRepository
  readonly authService: AuthServicePort
  readonly tokenStore: RefreshTokenRepository
  readonly refreshTokenTtlMs: number
  readonly logger?: LoggerPort
}

/** Crea la cuenta y devuelve sesion ya iniciada (tokens); falla si el email ya esta registrado. */
export class RegisterUserUseCase {
  constructor(private readonly options: RegisterUserUseCaseOptions) {}

  async execute(input: RegisterUserInput): Promise<RegisterUserOutput> {
    const { userRepo, authService, tokenStore, refreshTokenTtlMs, logger } = this.options
    const parsed = registerUserSchema.parse(input)

    const existing = await userRepo.findByEmail(parsed.email)
    if (existing) {
      throw new EmailAlreadyRegisteredError()
    }

    const passwordHash = await authService.hashPassword(parsed.password)
    const user = await userRepo.create({
      username: parsed.username,
      email: new Email(parsed.email),
      passwordHash,
      userType: parsed.userType,
      businessName: parsed.businessName ?? null,
      taxId: parsed.taxId ?? null,
      address: parsed.address ?? null,
    })

    const tokens = authService.generateTokens(user.id)
    await persistRefreshToken(tokenStore, user.id, tokens, refreshTokenTtlMs)

    // El userId ya identifica la cuenta; el email es PII y sobra en el log.
    logger?.info('auth.register', {
      userId: user.id,
      userType: parsed.userType,
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
