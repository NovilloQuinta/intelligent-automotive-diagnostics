import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import jwt from 'jsonwebtoken'
import {
  createAuthService,
  InvalidTokenPayloadError,
} from '@/infrastructure/services/authService.js'
import type { RefreshTokenRepository } from '@/application/ports/RefreshTokenRepository.js'

describe('authService', () => {
  const mockStore: RefreshTokenRepository = {
    saveRefreshToken: vi.fn().mockResolvedValue(undefined),
    findRefreshToken: vi.fn(),
    revokeRefreshToken: vi.fn().mockResolvedValue(undefined),
    revokeAllForUser: vi.fn().mockResolvedValue(undefined),
  }

  const service = createAuthService({
    accessTokenSecret: 'access-secret-test',
    refreshTokenSecret: 'refresh-secret-test',
    accessTokenExpiresIn: 900,
    refreshTokenExpiresIn: 604800,
    tokenStore: mockStore,
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('hashPassword', () => {
    it('should return a bcrypt hash starting with $2b$', async () => {
      const hash = await service.hashPassword('password123')
      expect(hash.startsWith('$2b$')).toBe(true)
    })

    it('should produce different hashes for the same password due to salt', async () => {
      const h1 = await service.hashPassword('same')
      const h2 = await service.hashPassword('same')
      expect(h1).not.toBe(h2)
    })

    it('should produce a 60-character hash', async () => {
      const hash = await service.hashPassword('test')
      expect(hash).toHaveLength(60)
    })
  })

  describe('comparePassword', () => {
    let hash: string

    beforeAll(async () => {
      hash = await service.hashPassword('mysecret')
    })

    it('should return true for the correct password', async () => {
      const result = await service.comparePassword('mysecret', hash)
      expect(result).toBe(true)
    })

    it('should return false for a wrong password', async () => {
      const result = await service.comparePassword('wrongpass', hash)
      expect(result).toBe(false)
    })

    it('should return false for an empty string', async () => {
      const result = await service.comparePassword('', hash)
      expect(result).toBe(false)
    })
  })

  describe('generateTokens', () => {
    it('should return accessToken and refreshToken as non-empty strings', () => {
      const tokens = service.generateTokens(1)
      expect(typeof tokens.accessToken).toBe('string')
      expect(typeof tokens.refreshToken).toBe('string')
      expect(tokens.accessToken.length).toBeGreaterThan(0)
      expect(tokens.refreshToken.length).toBeGreaterThan(0)
    })

    it("should encode userId as 'sub' claim in access token", () => {
      const { accessToken } = service.generateTokens(42)
      const decoded = jwt.verify(accessToken, 'access-secret-test') as {
        sub: number
      }
      expect(decoded.sub).toBe(42)
    })

    it("should encode userId as 'sub' claim in refresh token", () => {
      const { refreshToken } = service.generateTokens(7)
      const decoded = jwt.verify(refreshToken, 'refresh-secret-test') as {
        sub: number
      }
      expect(decoded.sub).toBe(7)
    })

    it('should set access token to expire in 15 minutes', () => {
      const { accessToken } = service.generateTokens(1)
      const decoded = jwt.verify(accessToken, 'access-secret-test') as {
        exp: number
        iat: number
      }
      const diffSeconds = decoded.exp - decoded.iat
      expect(diffSeconds).toBe(15 * 60)
    })

    it('should produce different tokens for the same userId on each call', () => {
      const t1 = service.generateTokens(1)
      const t2 = service.generateTokens(1)
      expect(t1.accessToken).not.toBe(t2.accessToken)
      expect(t1.refreshToken).not.toBe(t2.refreshToken)
    })
  })

  describe('verifyAccessToken', () => {
    it('should return userId for a valid token', () => {
      const { accessToken } = service.generateTokens(42)
      const userId = service.verifyAccessToken(accessToken)
      expect(userId).toBe(42)
    })

    it('should throw on a malformed token', () => {
      expect(() => service.verifyAccessToken('not-a-token')).toThrow()
    })

    it('should throw on a token signed with a wrong secret', () => {
      const fakeToken = jwt.sign({ sub: 99 }, 'wrong-secret')
      expect(() => service.verifyAccessToken(fakeToken)).toThrow()
    })

    it('should throw on an expired token', () => {
      const expiredToken = jwt.sign({ sub: 1 }, 'access-secret-test', {
        expiresIn: '-1s',
      })
      expect(() => service.verifyAccessToken(expiredToken)).toThrow()
    })
  })

  describe('refreshAccessToken', () => {
    it('should return a new token pair when refresh token is valid', async () => {
      const { refreshToken } = service.generateTokens(42)

      mockStore.findRefreshToken.mockResolvedValue({
        userId: 42,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        revokedAt: null,
      })

      const result = await service.refreshAccessToken(refreshToken)

      expect(result.accessToken).toBeDefined()
      expect(result.refreshToken).toBeDefined()
      expect(result.accessToken).not.toBe(refreshToken)
      expect(result.refreshToken).not.toBe(refreshToken)
      expect(mockStore.revokeRefreshToken).toHaveBeenCalledTimes(1)
      expect(mockStore.saveRefreshToken).toHaveBeenCalledTimes(1)
    })

    it('should throw when refresh token is not found in the store', async () => {
      mockStore.findRefreshToken.mockResolvedValue(null)

      const { refreshToken } = service.generateTokens(42)

      await expect(service.refreshAccessToken(refreshToken)).rejects.toThrow(
        'Refresh token not found',
      )
    })

    it('should throw when refresh token is revoked', async () => {
      mockStore.findRefreshToken.mockResolvedValue({
        userId: 42,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        revokedAt: new Date().toISOString(),
      })

      const { refreshToken } = service.generateTokens(42)

      await expect(service.refreshAccessToken(refreshToken)).rejects.toThrow(
        'Refresh token revoked',
      )
    })

    it('should throw when refresh token is expired', async () => {
      mockStore.findRefreshToken.mockResolvedValue({
        userId: 42,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
        revokedAt: null,
      })

      const { refreshToken } = service.generateTokens(42)

      await expect(service.refreshAccessToken(refreshToken)).rejects.toThrow(
        'Refresh token expired',
      )
    })

    it('should throw on a malformed refresh token JWT', async () => {
      await expect(service.refreshAccessToken('not-a-valid-jwt')).rejects.toThrow()
    })
  })
  describe('JWT payload validation', () => {
    it('should reject a correctly signed token whose sub is a string', () => {
      const forged = jwt.sign({ sub: '1', jti: 'x' }, 'access-secret-test', { expiresIn: '15m' })

      expect(() => service.verifyAccessToken(forged)).toThrow(InvalidTokenPayloadError)
    })

    it('should reject a correctly signed token with no sub at all', () => {
      const forged = jwt.sign({ jti: 'x' }, 'access-secret-test', { expiresIn: '15m' })

      expect(() => service.verifyAccessToken(forged)).toThrow(InvalidTokenPayloadError)
    })

    it('should still accept a well-formed token', () => {
      const { accessToken } = service.generateTokens(42)

      expect(service.verifyAccessToken(accessToken)).toBe(42)
    })
  })
})

describe('authService — sesion recordada', () => {
  const DAY_SECONDS = 24 * 3600
  const NORMAL_TTL = 7 * DAY_SECONDS
  const REMEMBERED_TTL = 30 * DAY_SECONDS
  /** Margen para la deriva entre firmar el token y leerlo. */
  const TOLERANCE_SECONDS = 60

  const store: RefreshTokenRepository = {
    saveRefreshToken: vi.fn().mockResolvedValue(undefined),
    findRefreshToken: vi.fn(),
    revokeRefreshToken: vi.fn().mockResolvedValue(undefined),
    revokeAllForUser: vi.fn().mockResolvedValue(undefined),
  }

  const service = createAuthService({
    accessTokenSecret: 'access-secret-test',
    refreshTokenSecret: 'refresh-secret-test',
    accessTokenExpiresIn: 900,
    refreshTokenExpiresIn: NORMAL_TTL,
    rememberMeRefreshTokenExpiresIn: REMEMBERED_TTL,
    tokenStore: store,
  })

  /** Segundos de vida que declara el token, leidos de sus claims. */
  function lifetimeOf(token: string): number {
    const { iat, exp } = jwt.decode(token) as { iat: number; exp: number }
    return exp - iat
  }

  function claimsOf(token: string): Record<string, unknown> {
    return jwt.decode(token) as Record<string, unknown>
  }

  /** Segundos entre ahora y la caducidad que se guardo en el almacen. */
  function savedLifetimeSeconds(): number {
    const [, , expiresAt] = store.saveRefreshToken.mock.calls.at(-1) as [number, string, string]
    return (new Date(expiresAt).getTime() - Date.now()) / 1000
  }

  beforeEach(() => {
    vi.clearAllMocks()
    store.findRefreshToken.mockResolvedValue({
      userId: 42,
      expiresAt: new Date(Date.now() + REMEMBERED_TTL * 1000).toISOString(),
      revokedAt: null,
    })
  })

  it('emite el refresh token con 30 dias y el claim rme cuando se recuerda', () => {
    const { refreshToken } = service.generateTokens(42, true)

    expect(claimsOf(refreshToken).rme).toBe(true)
    expect(lifetimeOf(refreshToken)).toBe(REMEMBERED_TTL)
  })

  it('emite el refresh token con 7 dias y sin claim rme cuando no se recuerda', () => {
    const { refreshToken } = service.generateTokens(42)

    expect(claimsOf(refreshToken).rme).toBeUndefined()
    expect(lifetimeOf(refreshToken)).toBe(NORMAL_TTL)
  })

  it('no marca el access token: su vida no depende de la casilla', () => {
    const { accessToken } = service.generateTokens(42, true)

    expect(claimsOf(accessToken).rme).toBeUndefined()
    expect(lifetimeOf(accessToken)).toBe(900)
  })

  it('la rotacion de una sesion recordada devuelve otra recordada de 30 dias', async () => {
    const { refreshToken } = service.generateTokens(42, true)

    const rotated = await service.refreshAccessToken(refreshToken)

    expect(claimsOf(rotated.refreshToken).rme).toBe(true)
    expect(lifetimeOf(rotated.refreshToken)).toBe(REMEMBERED_TTL)
    expect(savedLifetimeSeconds()).toBeGreaterThan(REMEMBERED_TTL - TOLERANCE_SECONDS)
  })

  it('la rotacion encadenada no encoge la ventana', async () => {
    const first = await service.refreshAccessToken(service.generateTokens(42, true).refreshToken)
    const second = await service.refreshAccessToken(first.refreshToken)

    expect(lifetimeOf(second.refreshToken)).toBe(REMEMBERED_TTL)
  })

  it('la rotacion de una sesion normal no la promueve a recordada', async () => {
    const { refreshToken } = service.generateTokens(42)

    const rotated = await service.refreshAccessToken(refreshToken)

    expect(claimsOf(rotated.refreshToken).rme).toBeUndefined()
    expect(lifetimeOf(rotated.refreshToken)).toBe(NORMAL_TTL)
    expect(savedLifetimeSeconds()).toBeLessThan(NORMAL_TTL + TOLERANCE_SECONDS)
  })
})
