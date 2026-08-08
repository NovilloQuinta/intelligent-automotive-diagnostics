import { describe, it, expect } from 'vitest'
import {
  adminListFilterBaseSchema,
  MAX_PAGE_SIZE,
} from '@/application/dto/admin/AdminListFilter.js'

describe('adminListFilterBaseSchema', () => {
  it('should default page to 1 and pageSize to 20', () => {
    const parsed = adminListFilterBaseSchema.parse({})

    expect(parsed.page).toBe(1)
    expect(parsed.pageSize).toBe(20)
  })

  it('should accept pageSize up to the max', () => {
    const parsed = adminListFilterBaseSchema.parse({ pageSize: MAX_PAGE_SIZE })

    expect(parsed.pageSize).toBe(MAX_PAGE_SIZE)
  })

  it('should reject a pageSize above the max of 100', () => {
    expect(() => adminListFilterBaseSchema.parse({ pageSize: 500 })).toThrow()
  })

  it('should coerce string query params to numbers', () => {
    const parsed = adminListFilterBaseSchema.parse({ page: '2', pageSize: '50' })

    expect(parsed.page).toBe(2)
    expect(parsed.pageSize).toBe(50)
  })

  it('should accept an optional free-text query', () => {
    const parsed = adminListFilterBaseSchema.parse({ q: 'error' })

    expect(parsed.q).toBe('error')
  })
})
