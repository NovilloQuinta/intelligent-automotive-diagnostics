import { describe, it, expect } from 'vitest'
import { knowledgeSearchInputSchema } from '@/application/dto/admin/KnowledgeSearchInput.js'

describe('knowledgeSearchInputSchema', () => {
  it('should accept a valid search body', () => {
    const parsed = knowledgeSearchInputSchema.parse({ text: 'misfire cylinder 1', index: 'dtcs' })

    expect(parsed.text).toBe('misfire cylinder 1')
    expect(parsed.index).toBe('dtcs')
  })

  it('should default limit when not provided', () => {
    const parsed = knowledgeSearchInputSchema.parse({ text: 'x', index: 'pids' })

    expect(parsed.limit).toBeGreaterThan(0)
  })

  it('should reject an unknown index', () => {
    expect(() => knowledgeSearchInputSchema.parse({ text: 'x', index: 'unknown' })).toThrow()
  })

  it('should reject an empty text', () => {
    expect(() => knowledgeSearchInputSchema.parse({ text: '', index: 'pids' })).toThrow()
  })
})
