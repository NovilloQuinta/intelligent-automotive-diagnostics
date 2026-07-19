import { describe, it, expect, vi } from 'vitest'
import jwt from 'jsonwebtoken'
import { createAuthMiddleware } from '@/infrastructure/http/middleware/authMiddleware.js'

const SECRET = 'test-secret'

function createMockReq(headers: Record<string, string> = {}) {
  return {
    headers,
    get(name: string) {
      const key = name.toLowerCase()
      for (const [k, v] of Object.entries(headers)) {
        if (k.toLowerCase() === key) return v
      }
      return undefined
    },
  }
}

function createMockRes() {
  const res: Record<string, unknown> = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res
}

describe('createAuthMiddleware', () => {
  const middleware = createAuthMiddleware(SECRET)

  it('should call next and set req.userId when token is valid', () => {
    const token = jwt.sign({ sub: 42 }, SECRET, { expiresIn: '15m' })
    const req = createMockReq({ authorization: `Bearer ${token}` })
    const res = createMockRes()
    const next = vi.fn()

    middleware(req as never, res as never, next)

    expect(next).toHaveBeenCalledTimes(1)
    expect((req as Record<string, unknown>).userId).toBe(42)
  })

  it('should return 401 when no Authorization header is present', () => {
    const req = createMockReq()
    const res = createMockRes()
    const next = vi.fn()

    middleware(req as never, res as never, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'Access token required' })
  })

  it('should return 401 when Authorization header has wrong format', () => {
    const req = createMockReq({ authorization: 'Basic xyz' })
    const res = createMockRes()
    const next = vi.fn()

    middleware(req as never, res as never, next)

    expect(res.status).toHaveBeenCalledWith(401)
  })

  it('should return 401 when token is malformed', () => {
    const req = createMockReq({ authorization: 'Bearer not.a.token' })
    const res = createMockRes()
    const next = vi.fn()

    middleware(req as never, res as never, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid access token' })
  })

  it('should return 401 when token has expired', () => {
    const expiredToken = jwt.sign({ sub: 99 }, SECRET, { expiresIn: '-1s' })
    const req = createMockReq({ authorization: `Bearer ${expiredToken}` })
    const res = createMockRes()
    const next = vi.fn()

    middleware(req as never, res as never, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'Access token expired' })
  })
})
