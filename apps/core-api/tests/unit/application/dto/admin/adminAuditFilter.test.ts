import { describe, it, expect } from 'vitest'
import { adminAuditFilterSchema } from '@/application/dto/admin/AdminAuditFilter.js'

describe('adminAuditFilterSchema', () => {
  it('should accept a valid HTTP status code', () => {
    const parsed = adminAuditFilterSchema.parse({ statusCode: 500 })

    expect(parsed.statusCode).toBe(500)
  })

  it('should reject a statusCode outside the valid HTTP range', () => {
    expect(() => adminAuditFilterSchema.parse({ statusCode: 999 })).toThrow()
  })

  it('should accept path and userId filters', () => {
    const parsed = adminAuditFilterSchema.parse({ path: '/api/diagnosis', userId: 7 })

    expect(parsed.path).toBe('/api/diagnosis')
    expect(parsed.userId).toBe(7)
  })

  it('should reject when "from" is after "to"', () => {
    expect(() =>
      adminAuditFilterSchema.parse({
        from: '2024-06-01T00:00:00.000Z',
        to: '2024-01-01T00:00:00.000Z',
      }),
    ).toThrow()
  })
})
