import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { createHash, randomUUID } from 'node:crypto'

/** Registro de refresh token devuelto por el store. */
export interface RefreshTokenRecord {
  readonly userId: number
  readonly expiresAt: string
  readonly revokedAt: string | null
}

/** Contrato para persistir y consultar refresh tokens. */
export interface RefreshTokenStore {
  saveRefreshToken(userId: number, tokenHash: string, expiresAt: string): Promise<void>
  findRefreshToken(tokenHash: string): Promise<RefreshTokenRecord | null>
  revokeRefreshToken(tokenHash: string): Promise<void>
}

/** Configuracion del servicio de autenticacion. */
interface AuthServiceConfig {
  readonly accessTokenSecret: string
  readonly refreshTokenSecret: string
  readonly accessTokenExpiresIn: string
  readonly refreshTokenExpiresIn: string
  readonly tokenStore: RefreshTokenStore
}

/** Servicio de autenticacion devuelto por {@link createAuthService}. */
export interface AuthService {
  hashPassword(password: string): Promise<string>
  comparePassword(password: string, hash: string): Promise<boolean>
  generateTokens(userId: number): {
    accessToken: string
    refreshToken: string
  }
  verifyAccessToken(token: string): number
  refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }>
}

const BCRYPT_ROUNDS = 12
const ALGORITHM_SHA256 = 'sha256'
const ENCODING_HEX = 'hex'
const REFRESH_TOKEN_DURATION_MS = 7 * 24 * 60 * 60 * 1000

function hashToken(token: string): string {
  return createHash(ALGORITHM_SHA256).update(token).digest(ENCODING_HEX)
}

function calculateExpiryDate(): string {
  return new Date(Date.now() + REFRESH_TOKEN_DURATION_MS).toISOString()
}

/** Crea una instancia del servicio de autenticacion con la configuracion dada. */
export function createAuthService(config: AuthServiceConfig): AuthService {
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

  function generateTokens(userId: number): {
    accessToken: string
    refreshToken: string
  } {
    const accessToken = jwt.sign({ sub: userId, jti: randomUUID() }, accessTokenSecret, {
      expiresIn: accessTokenExpiresIn,
    })
    const refreshToken = jwt.sign({ sub: userId, jti: randomUUID() }, refreshTokenSecret, {
      expiresIn: refreshTokenExpiresIn,
    })
    return { accessToken, refreshToken }
  }

  function verifyAccessToken(token: string): number {
    const decoded = jwt.verify(token, accessTokenSecret) as { sub: number }
    return decoded.sub
  }

  async function refreshAccessToken(
    refreshTokenStr: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const decoded = jwt.verify(refreshTokenStr, refreshTokenSecret) as {
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
