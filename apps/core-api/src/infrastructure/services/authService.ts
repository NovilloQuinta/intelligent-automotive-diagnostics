import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import type { AuthServicePort } from '@/application/ports/AuthServicePort.js'
import type { TokenPair } from '@/application/dto/auth/TokenPair.js'
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

/**
 * Payload minimo esperado en un JWT emitido por este servicio.
 *
 * Se valida en vez de castearse porque un token es una frontera no confiable:
 * la firma garantiza que nadie lo ha manipulado, no que su contenido tenga la
 * forma esperada. Un `sub` de tipo string colado con `as unknown as` acababa
 * en `generateTokens(userId: number)` sin que nadie se enterara.
 */
const jwtPayloadSchema = z.object({ sub: z.number().int().positive() })

/** Error lanzado cuando el refresh token presentado no consta en el almacen. */
export class RefreshTokenNotFoundError extends Error {
  constructor(message: string = 'Refresh token not found') {
    super(message)
    this.name = 'RefreshTokenNotFoundError'
  }
}

/** Error lanzado cuando el refresh token ya fue revocado (posible reuso). */
export class RefreshTokenRevokedError extends Error {
  constructor(message: string = 'Refresh token revoked') {
    super(message)
    this.name = 'RefreshTokenRevokedError'
  }
}

/** Error lanzado cuando el refresh token ha caducado. */
export class RefreshTokenExpiredError extends Error {
  constructor(message: string = 'Refresh token expired') {
    super(message)
    this.name = 'RefreshTokenExpiredError'
  }
}

/** Error lanzado cuando el payload de un JWT valido no tiene la forma esperada. */
export class InvalidTokenPayloadError extends Error {
  constructor(message: string = 'Invalid token payload') {
    super(message)
    this.name = 'InvalidTokenPayloadError'
  }
}

/**
 * Verifica la firma del token y valida su payload.
 *
 * @throws {InvalidTokenPayloadError} Si la firma es valida pero el payload no lo es.
 */
function verifyAndParse(token: string, secret: string): { sub: number } {
  const decoded = jwt.verify(token, secret)
  const parsed = jwtPayloadSchema.safeParse(decoded)
  if (!parsed.success) throw new InvalidTokenPayloadError()
  return parsed.data
}

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
    return verifyAndParse(token, accessTokenSecret).sub
  }

  async function refreshAccessToken(refreshTokenStr: string): Promise<TokenPair> {
    const decoded = verifyAndParse(refreshTokenStr, refreshTokenSecret)
    const tokenHash = hashToken(refreshTokenStr)

    const record = await tokenStore.findRefreshToken(tokenHash)
    if (!record) {
      throw new RefreshTokenNotFoundError()
    }
    if (record.revokedAt !== null) {
      throw new RefreshTokenRevokedError()
    }
    if (new Date(record.expiresAt) < new Date()) {
      throw new RefreshTokenExpiredError()
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
