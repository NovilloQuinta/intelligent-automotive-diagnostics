import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'node:crypto'
import type { AuthServicePort } from '@/application/ports/AuthServicePort.js'
import type { TokenPair } from '@/application/dto/TokenPair.js'
import type { RefreshTokenRepository } from '@/application/ports/RefreshTokenRepository.js'
import { hashToken, REFRESH_TOKEN_DURATION_MS } from '@/application/shared/hashToken.js'

/** Configuracion del servicio de autenticacion. */
interface AuthServiceConfig {
  readonly accessTokenSecret: string
  readonly refreshTokenSecret: string
  readonly accessTokenExpiresIn: string
  readonly refreshTokenExpiresIn: string
  readonly tokenStore: RefreshTokenRepository
}

const BCRYPT_ROUNDS = 12

function calculateExpiryDate(): string {
  return new Date(Date.now() + REFRESH_TOKEN_DURATION_MS).toISOString()
}

/** Crea una instancia del servicio de autenticacion con la configuracion dada. */
export function createAuthService(config: AuthServiceConfig): AuthServicePort {
  const {
    accessTokenSecret,
    refreshTokenSecret,
    accessTokenExpiresIn,
    refreshTokenExpiresIn,
    tokenStore,
  } = config

  async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS)
  }

  async function comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash)
  }

  function generateTokens(userId: number): TokenPair {
    const accessToken = jwt.sign({ sub: userId, jti: randomUUID() }, accessTokenSecret, {
      expiresIn: accessTokenExpiresIn as jwt.SignOptions['expiresIn'],
    })
    const refreshToken = jwt.sign({ sub: userId, jti: randomUUID() }, refreshTokenSecret, {
      expiresIn: refreshTokenExpiresIn as jwt.SignOptions['expiresIn'],
    })
    return { accessToken, refreshToken }
  }

  function verifyAccessToken(token: string): number {
    const decoded = jwt.verify(token, accessTokenSecret) as unknown as { sub: number }
    return decoded.sub
  }

  async function refreshAccessToken(refreshTokenStr: string): Promise<TokenPair> {
    const decoded = jwt.verify(refreshTokenStr, refreshTokenSecret) as unknown as {
      sub: number
    }
    const tokenHash = hashToken(refreshTokenStr)

    const record = await tokenStore.findRefreshToken(tokenHash)
    if (!record) {
      throw new Error('Refresh token not found')
    }
    if (record.revokedAt !== null) {
      throw new Error('Refresh token revoked')
    }
    if (new Date(record.expiresAt) < new Date()) {
      throw new Error('Refresh token expired')
    }

    await tokenStore.revokeRefreshToken(tokenHash)

    const tokens = generateTokens(decoded.sub)

    const newTokenHash = hashToken(tokens.refreshToken)
    const expiresAt = calculateExpiryDate()
    await tokenStore.saveRefreshToken(decoded.sub, newTokenHash, expiresAt)

    return tokens
  }

  return {
    hashPassword,
    comparePassword,
    generateTokens,
    verifyAccessToken,
    refreshAccessToken,
  }
}
