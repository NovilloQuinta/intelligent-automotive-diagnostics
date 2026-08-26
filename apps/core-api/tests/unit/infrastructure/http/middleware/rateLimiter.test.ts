import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockRateLimitHandler = vi.fn()

vi.mock('express-rate-limit', () => ({
  rateLimit: vi.fn().mockImplementation(() => mockRateLimitHandler),
}))

import { createRateLimiter } from '@/infrastructure/http/middleware/rate-limiter.middleware.js'
import { SqliteRateLimitStore } from '@/infrastructure/persistence/sqlite/rateLimitStore.js'
import { rateLimit } from 'express-rate-limit'

const originalNodeEnv = process.env.NODE_ENV
const originalRateLimitEnabled = process.env.RATE_LIMIT_ENABLED

/** El store que se le paso a `rateLimit` en la ultima llamada. */
function lastStore(): SqliteRateLimitStore {
  const [options] = vi.mocked(rateLimit).mock.calls.at(-1) ?? []
  return options?.store as SqliteRateLimitStore
}

/** Restaura una variable de entorno, borrandola si no estaba definida. */
function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

describe('createRateLimiter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NODE_ENV = 'production'
    delete process.env.RATE_LIMIT_ENABLED
  })

  afterEach(() => {
    restoreEnv('NODE_ENV', originalNodeEnv)
    restoreEnv('RATE_LIMIT_ENABLED', originalRateLimitEnabled)
  })

  describe('configuracion', () => {
    it('should call rateLimit with correct default configuration', () => {
      createRateLimiter()

      expect(rateLimit).toHaveBeenCalledWith(
        expect.objectContaining({
          windowMs: 15 * 60 * 1000,
          limit: 100,
          standardHeaders: true,
          legacyHeaders: false,
        }),
      )
    })

    it('should apply custom windowMinutes and maxRequests', () => {
      createRateLimiter({ windowMinutes: 30, maxRequests: 50, namespace: 'custom' })

      expect(rateLimit).toHaveBeenCalledWith(
        expect.objectContaining({
          windowMs: 30 * 60 * 1000,
          limit: 50,
        }),
      )
    })

    it('should return the middleware function from rateLimit', () => {
      const limiter = createRateLimiter()
      expect(limiter).toBe(mockRateLimitHandler)
    })

    it('should handle partial config by using defaults for missing fields', () => {
      createRateLimiter({ maxRequests: 200 })

      expect(rateLimit).toHaveBeenCalledWith(
        expect.objectContaining({
          windowMs: 15 * 60 * 1000,
          limit: 200,
        }),
      )
    })
  })

  describe('almacen persistente', () => {
    it('respalda el contador en SQLite en vez del MemoryStore por defecto', () => {
      createRateLimiter({ namespace: 'auth:login' })

      expect(lastStore()).toBeInstanceOf(SqliteRateLimitStore)
    })

    it('pasa al store el namespace declarado por el llamante', () => {
      createRateLimiter({ namespace: 'auth:login' })

      expect(lastStore().prefix).toBe('auth:login:')
    })

    it('deriva un namespace estable de la ventana y el limite si no se declara', () => {
      createRateLimiter({ windowMinutes: 1, maxRequests: 5 })

      expect(lastStore().prefix).toBe('default:1m:5:')
    })

    it('da el mismo namespace por defecto en dos construcciones equivalentes', () => {
      createRateLimiter({ windowMinutes: 1, maxRequests: 5 })
      const primero = lastStore().prefix
      createRateLimiter({ windowMinutes: 1, maxRequests: 5 })

      expect(lastStore().prefix).toBe(primero)
    })
  })

  describe('activacion con RATE_LIMIT_ENABLED', () => {
    it('limita en produccion cuando la variable no esta definida', () => {
      process.env.NODE_ENV = 'production'

      createRateLimiter()

      expect(rateLimit).toHaveBeenCalled()
    })

    it('deja pasar fuera de produccion cuando la variable no esta definida', () => {
      process.env.NODE_ENV = 'development'

      const limiter = createRateLimiter()

      expect(rateLimit).not.toHaveBeenCalled()
      expect(limiter).not.toBe(mockRateLimitHandler)
    })

    it('limita fuera de produccion si la variable vale true', () => {
      process.env.NODE_ENV = 'development'
      process.env.RATE_LIMIT_ENABLED = 'true'

      createRateLimiter()

      expect(rateLimit).toHaveBeenCalled()
    })

    it('deja pasar en produccion si la variable vale false', () => {
      process.env.NODE_ENV = 'production'
      process.env.RATE_LIMIT_ENABLED = 'false'

      createRateLimiter()

      expect(rateLimit).not.toHaveBeenCalled()
    })

    it('trata la variable vacia como no definida', () => {
      process.env.NODE_ENV = 'production'
      process.env.RATE_LIMIT_ENABLED = ''

      createRateLimiter()

      expect(rateLimit).toHaveBeenCalled()
    })

    it('el middleware inerte cede el paso al siguiente', () => {
      process.env.NODE_ENV = 'development'
      const next = vi.fn()

      const limiter = createRateLimiter() as (req: unknown, res: unknown, next: () => void) => void
      limiter({}, {}, next)

      expect(next).toHaveBeenCalledOnce()
    })
  })
})
