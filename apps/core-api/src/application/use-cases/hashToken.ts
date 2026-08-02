import { createHash } from 'node:crypto'
import type { RefreshTokenRepositoryPort } from '@/application/ports/refreshTokenRepository.port.js'
import type { TokenPair } from '@/application/ports/authService.port.js'

const ALGORITHM_SHA256 = 'sha256'
const ENCODING_HEX = 'hex'

/** Duracion por defecto de un refresh token: 7 dias en milisegundos. */
export const REFRESH_TOKEN_DURATION_MS = 7 * 24 * 60 * 60 * 1000

/** Calcula el hash SHA-256 de un token para almacenamiento seguro. */
export function hashToken(token: string): string {
  return createHash(ALGORITHM_SHA256).update(token).digest(ENCODING_HEX)
}

/** Persiste el hash del refresh token en el repositorio. */
export async function persistRefreshToken(
  tokenStore: RefreshTokenRepositoryPort,
  userId: number,
  tokens: TokenPair,
): Promise<void> {
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DURATION_MS).toISOString()
  const tokenHash = hashToken(tokens.refreshToken)
  await tokenStore.saveRefreshToken(userId, tokenHash, expiresAt)
}
