import { describe, it, expect } from 'vitest'
import { PidReading, PidReadingError } from '@/domain/entities/pidReading.js'

describe('PidReading', () => {
  it('should validate and normalize a valid reading', () => {
    const reading = new PidReading({
      id: 1,
      mode: '01',
      pidCode: '0c',
      sessionId: 42,
      rawHex: '41 0C 1A F8',
    })
    expect(reading.mode).toBe('01')
    expect(reading.pidCode).toBe('0C')
    expect(reading.sessionId).toBe(42)
    expect(reading.rawHex).toBe('410C1AF8')
    expect(reading.pidDefId).toBeUndefined()
  })

  it('should throw PidReadingError when mode is empty', () => {
    expect(
      () => new PidReading({ id: 1, mode: '   ', pidCode: '0C', sessionId: 42, rawHex: '41' }),
    ).toThrow(PidReadingError)
  })

  it('should throw PidReadingError when pidCode is empty', () => {
    expect(
      () => new PidReading({ id: 1, mode: '01', pidCode: '', sessionId: 42, rawHex: '41' }),
    ).toThrow(PidReadingError)
  })

  it('should reject non-hex rawHex', () => {
    expect(
      () => new PidReading({ id: 1, mode: '01', pidCode: '0C', sessionId: 42, rawHex: 'ZZ ZZ' }),
    ).toThrow(PidReadingError)
  })

  it('should keep pidDefId optional', () => {
    const withDef = new PidReading({
      id: 1,
      mode: '01',
      pidCode: '0C',
      sessionId: 42,
      rawHex: '41',
      pidDefId: 7,
    })
    expect(withDef.pidDefId).toBe(7)

    const withoutDef = new PidReading({
      id: 1,
      mode: '01',
      pidCode: '0C',
      sessionId: 42,
      rawHex: '41',
    })
    expect(withoutDef.pidDefId).toBeUndefined()
  })
})
