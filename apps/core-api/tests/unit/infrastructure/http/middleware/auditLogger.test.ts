import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import {
  createAuditLogger,
  isExcludedFromAudit,
} from '@/infrastructure/http/middleware/audit-logger.middleware.js'
import type { AuditLogRepository } from '@/application/ports/AuditLogRepository.js'

function createMockRes() {
  const emitter = new EventEmitter()
  const res = Object.assign(emitter, {
    statusCode: 200,
    getHeader: vi.fn().mockReturnValue(undefined),
    setHeader: vi.fn(),
  })
  return res
}

function createMockReq(overrides: Record<string, unknown> = {}) {
  return {
    method: 'GET',
    path: '/api/scenarios',
    ip: '127.0.0.1',
    headers: { 'user-agent': 'vitest' },
    ...overrides,
  }
}

describe('createAuditLogger', () => {
  let mockRepo: AuditLogRepository
  let middleware: ReturnType<typeof createAuditLogger>

  beforeEach(() => {
    mockRepo = {
      create: vi.fn().mockResolvedValue(undefined),
    }
    middleware = createAuditLogger(mockRepo)
  })

  it('should call repository.create after response finishes', async () => {
    const req = createMockReq()
    const res = createMockRes()
    const next = vi.fn()

    middleware(req as never, res as never, next)

    expect(next).toHaveBeenCalled()
    expect(mockRepo.create).not.toHaveBeenCalled()

    // Simulate response finish
    res.emit('finish')

    // Allow async fire-and-forget to complete
    await vi.waitFor(() => {
      expect(mockRepo.create).toHaveBeenCalledTimes(1)
    })

    const call = (mockRepo.create as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.method).toBe('GET')
    expect(call.path).toBe('/api/scenarios')
    expect(call.statusCode).toBe(200)
    expect(call.ip).toBe('127.0.0.1')
    expect(call.userAgent).toBe('vitest')
    expect(call.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('should record correct status code from response', async () => {
    const req = createMockReq({ path: '/api/unknown' })
    const res = createMockRes()
    res.statusCode = 404
    const next = vi.fn()

    middleware(req as never, res as never, next)
    res.emit('finish')

    await vi.waitFor(() => {
      expect(mockRepo.create).toHaveBeenCalledTimes(1)
    })

    const call = (mockRepo.create as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.statusCode).toBe(404)
  })

  it('should not throw if repository.create fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    ;(mockRepo.create as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB error'))

    const req = createMockReq()
    const res = createMockRes()
    const next = vi.fn()

    // Should not throw
    expect(() => {
      middleware(req as never, res as never, next)
      res.emit('finish')
    }).not.toThrow()

    await vi.waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled()
    })

    consoleSpy.mockRestore()
  })

  describe('exclusion of /api/admin/*', () => {
    it('should not call repository.create for a request under /api/admin', async () => {
      const req = createMockReq({ path: '/api/admin/logs' })
      const res = createMockRes()
      const next = vi.fn()

      middleware(req as never, res as never, next)
      res.emit('finish')

      expect(next).toHaveBeenCalled()
      // Da tiempo a que un fire-and-forget indebido se resolviera si existiera.
      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(mockRepo.create).not.toHaveBeenCalled()
    })

    it('should still audit routes that are not under /api/admin', async () => {
      const req = createMockReq({ path: '/api/scenarios' })
      const res = createMockRes()
      const next = vi.fn()

      middleware(req as never, res as never, next)
      res.emit('finish')

      await vi.waitFor(() => {
        expect(mockRepo.create).toHaveBeenCalledTimes(1)
      })
    })

    it('should exclude by originalUrl when a mounted sub-router rewrote req.path (Express mount semantics)', async () => {
      // Express reescribe req.path/req.url a la ruta relativa al montaje mientras la
      // peticion esta dentro de un sub-router (aqui, '/api/admin'); si la respuesta se
      // envia sin volver a "desenrollar" ese estado, req.path en 'finish' queda como
      // '/overview', no '/api/admin/overview'. req.originalUrl si conserva la ruta completa.
      const req = createMockReq({ path: '/overview', originalUrl: '/api/admin/overview' })
      const res = createMockRes()
      const next = vi.fn()

      middleware(req as never, res as never, next)
      res.emit('finish')

      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(mockRepo.create).not.toHaveBeenCalled()
    })
  })
})

describe('isExcludedFromAudit', () => {
  it('should exclude any path under /api/admin', () => {
    expect(isExcludedFromAudit('/api/admin')).toBe(true)
    expect(isExcludedFromAudit('/api/admin/logs')).toBe(true)
    expect(isExcludedFromAudit('/api/admin/knowledge/search')).toBe(true)
  })

  it('should not exclude other paths, including ones that merely start similarly', () => {
    expect(isExcludedFromAudit('/api/scenarios')).toBe(false)
    expect(isExcludedFromAudit('/api/administration')).toBe(false)
    expect(isExcludedFromAudit('/api/auth/login')).toBe(false)
  })
})
