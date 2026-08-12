import { createHash } from 'node:crypto'
import type { RefreshTokenRepository } from '@/application/ports/RefreshTokenRepository.js'
import type { TokenPair } from '@/application/dto/auth/TokenPair.js'

const ALGORITHM_SHA256 = 'sha256'
const ENCODING_HEX = 'hex'

/** Calcula el hash SHA-256 de un token para almacenamiento seguro. */
export function hashToken(token: string): string {
  return createHash(ALGORITHM_SHA256).update(token).digest(ENCODING_HEX)
}

/** Persiste el hash del refresh token en el repositorio. */
export async function persistRefreshToken(
  tokenStore: RefreshTokenRepository,
  userId: number,
  tokens: TokenPair,
  refreshTokenTtlMs: number,
): Promise<void> {
  const expiresAt = new Date(Date.now() + refreshTokenTtlMs).toISOString()
  const tokenHash = hashToken(tokens.refreshToken)
  await tokenStore.saveRefreshToken(userId, tokenHash, expiresAt)
}
