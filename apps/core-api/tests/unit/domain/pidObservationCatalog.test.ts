import { describe, it, expect } from 'vitest'
import {
  PID_OBSERVATION_CATALOG,
  resolvePidObservationStatus,
} from '@/domain/pidObservationCatalog.js'

describe('PID_OBSERVATION_CATALOG', () => {
  const expectedKeys = ['01 0C', '01 05', '01 0D', '01 0F', '01 11', '01 04', '01 42']

  it.each(expectedKeys)('should contain an entry with name for %s', (key) => {
    const def = PID_OBSERVATION_CATALOG.get(key)

    expect(def).toBeDefined()
    expect(def?.name.length).toBeGreaterThan(0)
  })

  it('should define a unit for every catalogued PID', () => {
    for (const key of expectedKeys) {
      expect(PID_OBSERVATION_CATALOG.get(key)?.unit).toBeTruthy()
    }
  })

  it('should not contain unexpected entries', () => {
    expect([...PID_OBSERVATION_CATALOG.keys()].sort()).toEqual([...expectedKeys].sort())
  })
})

describe('resolvePidObservationStatus', () => {
  it('should return review when value is above maxValue', () => {
    const def = PID_OBSERVATION_CATALOG.get('01 0C')!

    expect(resolvePidObservationStatus(6501, def)).toBe('review')
  })

  it('should return review when value is below minValue (low control module voltage)', () => {
    const def = PID_OBSERVATION_CATALOG.get('01 42')!

    expect(resolvePidObservationStatus(10.9, def)).toBe('review')
  })

  it('should return ok at the exact maxValue boundary', () => {
    const def = PID_OBSERVATION_CATALOG.get('01 0C')!

    expect(resolvePidObservationStatus(6500, def)).toBe('ok')
  })

  it('should return ok at the exact minValue boundary', () => {
    const def = PID_OBSERVATION_CATALOG.get('01 42')!

    expect(resolvePidObservationStatus(11.5, def)).toBe('ok')
  })

  it('should return ok when the PID defines neither minValue nor maxValue', () => {
    const def = PID_OBSERVATION_CATALOG.get('01 0D')!

    expect(def.minValue).toBeUndefined()
    expect(def.maxValue).toBeUndefined()
    expect(resolvePidObservationStatus(999, def)).toBe('ok')
  })
})
