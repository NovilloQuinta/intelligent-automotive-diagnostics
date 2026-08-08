import { describe, it, expect } from 'vitest'
import { adminLogsFilterSchema } from '@/application/dto/admin/AdminLogsFilter.js'

describe('adminLogsFilterSchema', () => {
  it('should accept a known log level', () => {
    const parsed = adminLogsFilterSchema.parse({ level: 'error' })

    expect(parsed.level).toBe('error')
  })

  it('should reject an unknown log level', () => {
    expect(() => adminLogsFilterSchema.parse({ level: 'critical' })).toThrow()
  })

  it('should accept the filter without a level', () => {
    const parsed = adminLogsFilterSchema.parse({})

    expect(parsed.level).toBeUndefined()
  })

  it('should reject when "from" is after "to"', () => {
    expect(() =>
      adminLogsFilterSchema.parse({
        from: '2024-06-01T00:00:00.000Z',
        to: '2024-01-01T00:00:00.000Z',
      }),
    ).toThrow()
  })

  it('should accept when "from" is before "to"', () => {
    const parsed = adminLogsFilterSchema.parse({
      from: '2024-01-01T00:00:00.000Z',
      to: '2024-06-01T00:00:00.000Z',
    })

    expect(parsed.from).toBe('2024-01-01T00:00:00.000Z')
  })
})
