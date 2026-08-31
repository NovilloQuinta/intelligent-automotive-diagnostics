import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import type { AuthServicePort } from '@/application/ports/AuthServicePort.js'
import type { TokenPair } from '@/application/dto/auth/TokenPair.js'
import type { RefreshTokenRepository } from '@/application/ports/RefreshTokenRepository.js'
import { hashToken } from '@/application/shared/hashToken.js'
import { resolveRefreshTtl } from '@/application/shared/rememberMeTtl.js'

/** Configuracion del servicio de autenticacion. */
interface AuthServiceConfig {
  readonly accessTokenSecret: string
  readonly refreshTokenSecret: string
  readonly accessTokenExpiresIn: number
  readonly refreshTokenExpiresIn: number
  /**
   * Vida del refresh token de una sesion recordada. Ausente = no hay sesiones
   * recordadas y todas duran `refreshTokenExpiresIn`.
   */
  readonly rememberMeRefreshTokenExpiresIn?: number
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
const jwtPayloadSchema = z.object({
  sub: z.number().int().positive(),
  /**
   * Marca de sesion recordada. Solo la llevan los refresh tokens: la vida del
   * access token no depende de la casilla. Va firmada para que la rotacion sepa
   * cuanto dura la sesion sin volver a preguntar a la base de datos, y para que
   * el cliente no pueda alargarsela por su cuenta.
   */
  rme: z.boolean().optional(),
})

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
function verifyAndParse(token: string, secret: string): { sub: number; rme?: boolean } {
  const decoded = jwt.verify(token, secret)
  const parsed = jwtPayloadSchema.safeParse(decoded)
  if (!parsed.success) throw new InvalidTokenPayloadError()
  return parsed.data
}

function calculateExpiryDate(refreshTokenTtlSeconds: number): string {
  return new Date(Date.now() + refreshTokenTtlSeconds * 1000).toISOString()
}

/** Crea una instancia del servicio de autenticacion con la configuracion dada. */
export function createAuthService(config: AuthServiceConfig): AuthServicePort {
  const {
    accessTokenSecret,
    refreshTokenSecret,
    accessTokenExpiresIn,
    refreshTokenExpiresIn,
    rememberMeRefreshTokenExpiresIn,
    tokenStore,
  } = config

  /** Vida del refresh token segun la casilla "Recordarme" del login. */
  function refreshTtlFor(rememberMe: boolean): number {
    return resolveRefreshTtl(rememberMe, refreshTokenExpiresIn, rememberMeRefreshTokenExpiresIn)
  }

  async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS)
  }

  async function comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash)
  }

  function generateTokens(userId: number, rememberMe: boolean = false): TokenPair {
    const accessToken = jwt.sign({ sub: userId, jti: randomUUID() }, accessTokenSecret, {
      expiresIn: accessTokenExpiresIn as jwt.SignOptions['expiresIn'],
    })
    const refreshPayload = rememberMe
      ? { sub: userId, jti: randomUUID(), rme: true }
      : { sub: userId, jti: randomUUID() }
    const refreshToken = jwt.sign(refreshPayload, refreshTokenSecret, {
      expiresIn: refreshTtlFor(rememberMe) as jwt.SignOptions['expiresIn'],
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

    // La sesion recordada se propaga al token nuevo. Sin esto, la primera
    // rotacion —a los 15 minutos— devolveria la sesion a la duracion normal y
    // el usuario se quedaria fuera antes de tiempo sin ningun error visible.
    const rememberMe = decoded.rme === true
    const tokens = generateTokens(decoded.sub, rememberMe)

    const newTokenHash = hashToken(tokens.refreshToken)
    const expiresAt = calculateExpiryDate(refreshTtlFor(rememberMe))
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
