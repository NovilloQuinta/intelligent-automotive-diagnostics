import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockRateLimitHandler = vi.fn()

vi.mock('express-rate-limit', () => ({
  rateLimit: vi.fn().mockImplementation(() => mockRateLimitHandler),
}))

import { createRateLimiter } from '@/infrastructure/http/middleware/rate-limiter.middleware.js'
import { rateLimit } from 'express-rate-limit'

const originalNodeEnv = process.env.NODE_ENV

describe('createRateLimiter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NODE_ENV = 'production'
  })

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
  })

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
    createRateLimiter({ windowMinutes: 30, maxRequests: 50 })

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
