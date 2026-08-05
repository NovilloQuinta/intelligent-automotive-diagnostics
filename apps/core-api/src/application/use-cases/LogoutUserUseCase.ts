import type { RefreshTokenRepository } from '@/application/ports/RefreshTokenRepository.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import { hashToken } from '@/application/shared/hashToken.js'
import { refreshTokenSchema, type RefreshTokenInput } from '@/application/dto/RefreshTokenInput.js'

/** Caso de uso: cierre de sesion. Revoca el refresh token para invalidarlo. */
export class LogoutUserUseCase {
  constructor(
    private readonly tokenStore: RefreshTokenRepository,
    private readonly logger?: LoggerPort,
  ) {}

  async execute(input: RefreshTokenInput): Promise<void> {
    const parsed = refreshTokenSchema.parse(input)

    const tokenHash = hashToken(parsed.refreshToken)
    await this.tokenStore.revokeRefreshToken(tokenHash)

    this.logger?.info('auth.logout')
  }
}
