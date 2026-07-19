import { describe, it, expect } from 'vitest'
import {
  decodeVin,
  validateVin,
  isValidCheckDigit,
  decodeWmi,
  VinDecodeError,
} from '@/infrastructure/obd/protocol/vinDecoder.js'

describe('vinDecoder', () => {
  describe('decodeVin', () => {
    it('should decode 17 ASCII bytes to VIN string', () => {
      const bytes = 'WAUZZZ8V5JA123456'.split('').map((c) => c.charCodeAt(0))
      const result = decodeVin(bytes)
      expect(result).toBe('WAUZZZ8V5JA123456')
    })

    it('should throw on wrong byte count', () => {
      expect(() => decodeVin([0x57, 0x41])).toThrow(VinDecodeError)
    })

    it('should throw on forbidden characters in bytes', () => {
      // 'I' is forbidden in VIN
      const bytes = 'WAIZZZ8V5JA123456'.split('').map((c) => c.charCodeAt(0))
      expect(() => decodeVin(bytes)).toThrow(VinDecodeError)
    })

    it('should convert lowercase to uppercase', () => {
      const bytes = 'wauzzz8v5ja123456'.split('').map((c) => c.charCodeAt(0))
      const result = decodeVin(bytes)
      expect(result).toBe('WAUZZZ8V5JA123456')
    })
  })

  describe('validateVin', () => {
    it('should validate a correct VIN', () => {
      expect(() => validateVin('WAUZZZ8V5JA123456')).not.toThrow()
    })

    it('should throw on wrong length', () => {
      expect(() => validateVin('WAUZZZ8')).toThrow(VinDecodeError)
    })

    it('should throw on forbidden character I', () => {
      expect(() => validateVin('WAIZZZ8V5JA123456')).toThrow(VinDecodeError)
    })

    it('should throw on forbidden character O', () => {
      expect(() => validateVin('WAOZZZ8V5JA123456')).toThrow(VinDecodeError)
    })

    it('should throw on forbidden character Q', () => {
      expect(() => validateVin('WAQZZZ8V5JA123456')).toThrow(VinDecodeError)
    })

    it('should accept lowercase and convert to uppercase', () => {
      expect(validateVin('wauzzz8v5ja123456')).toBe('WAUZZZ8V5JA123456')
    })

    it('should throw on invalid character (underscore)', () => {
      expect(() => validateVin('WAU_ZZ8V5JA123456')).toThrow(VinDecodeError)
    })
  })

  describe('isValidCheckDigit', () => {
    it('should validate a correct check digit', () => {
      // VIN with correct check digit: 1M8GDM9AXKP042788 (check digit = X)
      expect(isValidCheckDigit('1M8GDM9AXKP042788')).toBe(true)
    })

    it('should reject an incorrect check digit', () => {
      // Same VIN with wrong check digit
      expect(isValidCheckDigit('1M8GDM9A5KP042788')).toBe(false)
    })

    it('should return false for wrong length', () => {
      expect(isValidCheckDigit('SHORT')).toBe(false)
    })

    it('should handle valid VIN with numeric check digit', () => {
      // Straight-ones VIN: 11111111111111111 has check digit 1
      expect(isValidCheckDigit('11111111111111111')).toBe(true)
    })
  })

  describe('decodeWmi', () => {
    it('should identify Germany from W prefix', () => {
      const result = decodeWmi('WAUZZZ8V5JA123456')
      expect(result).not.toBeNull()
      expect(result!.country).toBe('Germany')
      expect(result!.region).toBe('Europe')
    })

    it('should identify Japan from J prefix', () => {
      const result = decodeWmi('JKAZR2A1XLA000111')
      expect(result).not.toBeNull()
      expect(result!.country).toBe('Japan')
      expect(result!.region).toBe('Asia')
    })

    it('should identify United States from numeric prefix', () => {
      const result = decodeWmi('1M8GDM9AXKP042788')
      expect(result).not.toBeNull()
      expect(result!.country).toBe('United States')
    })

    it('should return null for unknown WMI', () => {
      // 0X is not a valid WMI region (0 not used in first position)
      const result = decodeWmi('0XZZZZZ8V5JA12345')
      expect(result).toBeNull()
    })
  })
})
