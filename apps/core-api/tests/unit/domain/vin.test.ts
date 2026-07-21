import { describe, it, expect } from 'vitest'
import { Vin, VinDecodeError, validateVin, isValidCheckDigit, decodeWmi } from '@/domain/vin.js'

describe('Vin', () => {
  describe('Vin.create', () => {
    it('should create a Vin from a valid 17-char string', () => {
      const vin = Vin.create('WAUZZZ8V5JA123456')
      expect(vin.value).toBe('WAUZZZ8V5JA123456')
      expect(vin.toString()).toBe('WAUZZZ8V5JA123456')
    })

    it('should uppercase input', () => {
      const vin = Vin.create('wauzzz8v5ja123456')
      expect(vin.value).toBe('WAUZZZ8V5JA123456')
    })

    it('should strip whitespace', () => {
      const vin = Vin.create('  WAUZZZ8V5JA123456  ')
      expect(vin.value).toBe('WAUZZZ8V5JA123456')
    })

    it('should throw VinDecodeError when length is not 17', () => {
      expect(() => Vin.create('SHORT')).toThrow(VinDecodeError)
      expect(() => Vin.create('WAYTOOLONGVINSTRING')).toThrow(VinDecodeError)
    })

    it('should throw VinDecodeError when containing forbidden character I', () => {
      expect(() => Vin.create('WAIZZZ8V5JA123456')).toThrow(VinDecodeError)
    })

    it('should throw VinDecodeError when containing forbidden character O', () => {
      expect(() => Vin.create('WAOZZZ8V5JA123456')).toThrow(VinDecodeError)
    })

    it('should throw VinDecodeError when containing forbidden character Q', () => {
      expect(() => Vin.create('WAQZZZ8V5JA123456')).toThrow(VinDecodeError)
    })

    it('should throw VinDecodeError when containing non-alphanumeric chars', () => {
      expect(() => Vin.create('WAU_ZZ8V5JA123456')).toThrow(VinDecodeError)
    })
  })

  describe('Vin.fromTrusted', () => {
    it('should create a Vin without validation', () => {
      const vin = Vin.fromTrusted('WAUZZZ8V5JA123456')
      expect(vin.value).toBe('WAUZZZ8V5JA123456')
    })

    it('should not validate input', () => {
      const vin = Vin.fromTrusted('SHORT')
      expect(vin.value).toBe('SHORT')
    })
  })
})

describe('validateVin', () => {
  it('should validate and return uppercase VIN', () => {
    expect(validateVin('WAUZZZ8V5JA123456')).toBe('WAUZZZ8V5JA123456')
  })

  it('should throw on invalid VIN', () => {
    expect(() => validateVin('SHORT')).toThrow(VinDecodeError)
  })
})

describe('isValidCheckDigit', () => {
  it('should return true for correct check digit', () => {
    expect(isValidCheckDigit('11111111111111111')).toBe(true)
  })

  it('should return false for invalid check digit', () => {
    expect(isValidCheckDigit('WAUZZZ8V5JA123456')).toBe(false)
  })

  it('should return false for short VIN', () => {
    expect(isValidCheckDigit('SHORT')).toBe(false)
  })
})

describe('decodeWmi', () => {
  it('should identify Spain', () => {
    const result = decodeWmi('UXXZZZ8V5JA123456')
    expect(result).toEqual({ country: 'Spain', region: 'Europe' })
  })

  it('should identify Germany', () => {
    const result = decodeWmi('WAUZZZ8V5JA123456')
    expect(result).toEqual({ country: 'Germany', region: 'Europe' })
  })

  it('should identify Japan', () => {
    const result = decodeWmi('JKAZR2A1XLA000111')
    expect(result).toEqual({ country: 'Japan', region: 'Asia' })
  })

  it('should return null for unknown WMI', () => {
    expect(decodeWmi('999')).toBeNull()
  })

  it('should return null for short VIN', () => {
    expect(decodeWmi('AB')).toBeNull()
  })
})
