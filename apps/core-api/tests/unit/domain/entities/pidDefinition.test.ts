import { describe, it, expect } from 'vitest'
import { PidDefinition } from '@/domain/entities/pidDefinition.js'
import { PidCode } from '@/domain/value-objects/pidCode.js'

type PidDefinitionParams = ConstructorParameters<typeof PidDefinition>[0]

function buildPidDefinition(overrides: Partial<PidDefinitionParams> = {}): PidDefinition {
  return new PidDefinition({
    id: 1,
    pidCode: new PidCode('01', '0C'),
    name: 'Engine RPM',
    formula: '(A*256+B)/4',
    dataBytes: 2,
    pidType: 'formula',
    confidence: 1,
    source: 'seed',
    ...overrides,
  })
}

describe('PidDefinition', () => {
  describe('system', () => {
    it('should expose system when provided', () => {
      const def = buildPidDefinition({ system: 'Engine' })
      expect(def.system).toBe('Engine')
    })

    it('should be undefined when system is not provided', () => {
      const def = buildPidDefinition()
      expect(def.system).toBeUndefined()
    })

    it('should not throw when system is empty after trim', () => {
      expect(() => buildPidDefinition({ system: '   ' })).not.toThrow()
    })
  })

  describe('vehicleId and ecuId removal', () => {
    it('should not expose vehicleId', () => {
      const def = buildPidDefinition()
      expect(def).not.toHaveProperty('vehicleId')
    })

    it('should not expose ecuId', () => {
      const def = buildPidDefinition()
      expect(def).not.toHaveProperty('ecuId')
    })
  })
})
