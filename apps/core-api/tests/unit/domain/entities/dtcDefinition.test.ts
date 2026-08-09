import { describe, it, expect } from 'vitest'
import type { DtcDefinition } from '@/domain/entities/dtcDefinition.js'

describe('DtcDefinition', () => {
  const sample: DtcDefinition = {
    id: 1,
    manufacturer: 'Toyota',
    model: 'Auris Hybrid',
    code: 'P0301',
    description: 'Cylinder 1 Misfire Detected',
    confidence: 0.85,
    source: 'web',
    createdAt: '2026-08-09T12:00:00Z',
  }

  describe('interface accepts valid fields', () => {
    it('should have all required fields', () => {
      expect(sample.id).toBe(1)
      expect(sample.manufacturer).toBe('Toyota')
      expect(sample.model).toBe('Auris Hybrid')
      expect(sample.code).toBe('P0301')
      expect(sample.confidence).toBe(0.85)
      expect(sample.source).toBe('web')
    })

    it('should support string description', () => {
      expect(sample.description).toBe('Cylinder 1 Misfire Detected')
    })

    it('should support createdAt timestamp', () => {
      expect(sample.createdAt).toBe('2026-08-09T12:00:00Z')
    })
  })

  describe('optional fields can be undefined', () => {
    const minimal: DtcDefinition = {
      id: 2,
      manufacturer: 'Ford',
      model: 'Focus',
      code: 'B1000',
      confidence: 0.5,
      source: 'llm_guess',
    }

    it('should allow description to be undefined', () => {
      expect(minimal.description).toBeUndefined()
    })

    it('should allow createdAt to be undefined', () => {
      expect(minimal.createdAt).toBeUndefined()
    })

    it('should still have all required fields present', () => {
      expect(minimal.id).toBe(2)
      expect(minimal.manufacturer).toBe('Ford')
      expect(minimal.model).toBe('Focus')
      expect(minimal.code).toBe('B1000')
      expect(minimal.confidence).toBe(0.5)
      expect(minimal.source).toBe('llm_guess')
    })
  })
})
