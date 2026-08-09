import { describe, it, expect } from 'vitest'
import { normalizeManufacturer } from '@/domain/value-objects/manufacturer.js'

describe('normalizeManufacturer', () => {
  it('should normalize to title case', () => {
    expect(normalizeManufacturer('audi')).toBe('Audi')
    expect(normalizeManufacturer('BMW')).toBe('BMW')
  })

  it('should expand abbreviations', () => {
    expect(normalizeManufacturer('VW')).toBe('Volkswagen')
    expect(normalizeManufacturer('GMC')).toBe('General Motors')
  })

  it('should remove corporate suffixes', () => {
    expect(normalizeManufacturer('Volkswagen AG')).toBe('Volkswagen')
    expect(normalizeManufacturer('Toyota Motor Corp')).toBe('Toyota')
  })

  it('should handle null/empty/whitespace', () => {
    expect(normalizeManufacturer('')).toBe('')
    expect(normalizeManufacturer('   ')).toBe('')
  })

  it('should apply transformations in order', () => {
    expect(normalizeManufacturer('vw ag')).toBe('Volkswagen')
  })
})
