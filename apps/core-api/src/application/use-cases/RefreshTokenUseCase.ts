import type { AuthServicePort } from '@/application/ports/AuthServicePort.js'
import {
  refreshTokenSchema,
  type RefreshTokenInput,
} from '@/application/dto/RefreshTokenInput.js'
import type { RefreshTokenOutput } from '@/application/dto/RefreshTokenOutput.js'

/** Caso de uso: rotacion de refresh token. */
export class RefreshTokenUseCase {
  constructor(private readonly authService: AuthServicePort) {}

  async execute(input: RefreshTokenInput): Promise<RefreshTokenOutput> {
    const parsed = refreshTokenSchema.parse(input)

    const tokens = await this.authService.refreshAccessToken(parsed.refreshToken)

    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }
  }
}
