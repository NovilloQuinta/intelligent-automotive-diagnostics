import type { AuthServicePort } from '@/application/ports/AuthServicePort.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import {
  refreshTokenSchema,
  type RefreshTokenInput,
} from '@/application/dto/auth/RefreshTokenInput.js'
import type { RefreshTokenOutput } from '@/application/dto/auth/RefreshTokenOutput.js'

/** Caso de uso: rotacion de refresh token. */
export class RefreshTokenUseCase {
  constructor(
    private readonly authService: AuthServicePort,
    private readonly logger?: LoggerPort,
  ) {}

  async execute(input: RefreshTokenInput): Promise<RefreshTokenOutput> {
    const parsed = refreshTokenSchema.parse(input)

    try {
      const tokens = await this.authService.refreshAccessToken(parsed.refreshToken)
      this.logger?.info('auth.refresh_success')
      return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }
    } catch (err) {
      this.logger?.info('auth.refresh_failed')
      throw err
    }
  }
}
