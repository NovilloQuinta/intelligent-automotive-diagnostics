import { describe, it, expect } from 'vitest'
import { adminUsersFilterSchema } from '@/application/dto/admin/AdminUsersFilter.js'

describe('adminUsersFilterSchema', () => {
  it('should accept a free-text query over email/username', () => {
    const parsed = adminUsersFilterSchema.parse({ q: 'taller' })

    expect(parsed.q).toBe('taller')
  })

  it('should default pagination like the shared base schema', () => {
    const parsed = adminUsersFilterSchema.parse({})

    expect(parsed.page).toBe(1)
    expect(parsed.pageSize).toBe(20)
  })

  it('should reject when "from" is after "to"', () => {
    expect(() =>
      adminUsersFilterSchema.parse({
        from: '2024-06-01T00:00:00.000Z',
        to: '2024-01-01T00:00:00.000Z',
      }),
    ).toThrow()
  })
})
