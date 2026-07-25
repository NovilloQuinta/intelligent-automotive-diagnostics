import { describe, it, expect } from 'vitest'
import { Vin, VinDecodeError } from '@/domain/vin.js'

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

    it('should throw VinDecodeError for empty string', () => {
      expect(() => Vin.create('')).toThrow(VinDecodeError)
    })

    it('should throw VinDecodeError for whitespace-only string', () => {
      expect(() => Vin.create('                 ')).toThrow(VinDecodeError)
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

    it('should throw VinDecodeError when containing special characters', () => {
      expect(() => Vin.create('WAU#Z$8V5JA123456')).toThrow(VinDecodeError)
      expect(() => Vin.create('WAU@ZZ8V5JA123456')).toThrow(VinDecodeError)
    })

    it('should throw VinDecodeError when 17 chars are all forbidden', () => {
      expect(() => Vin.create('IIIIIIIIIIIIIIIII')).toThrow(VinDecodeError)
    })

    it('should throw VinDecodeError for lowercase ', () => {
      expect(() => Vin.create('waiiiiiv5ja123456')).toThrow(VinDecodeError)
    })

    it('should create a Vin with all valid same character', () => {
      const vin = Vin.create('AAAAAAAAAAAAAAAAA')
      expect(vin.value).toBe('AAAAAAAAAAAAAAAAA')
    })

    it('should create a Vin with numeric characters only', () => {
      const vin = Vin.create('11111111111111111')
      expect(vin.value).toBe('11111111111111111')
    })
  })

  describe('Vin.isCheckDigitValid', () => {
    it('should return true for correct check digit', () => {
      const vin = Vin.create('11111111111111111')
      expect(vin.isCheckDigitValid()).toBe(true)
    })

    it('should return true for valid VIN with correct check digit', () => {
      const vin = Vin.create('1M8GDM9AXKP042788')
      expect(vin.isCheckDigitValid()).toBe(true)
    })

    it('should return false for invalid check digit', () => {
      const vin = Vin.create('WAUZZZ8V5JA123456')
      expect(vin.isCheckDigitValid()).toBe(false)
    })

    it('should return false for VIN with mismatched check digit', () => {
      const vin = Vin.create('1M8GDM9A5KP042788')
      expect(vin.isCheckDigitValid()).toBe(false)
    })
  })

  describe('Vin.wmiRegion', () => {
    it('should identify Spain', () => {
      const vin = Vin.create('UXXZZZ8V5JA123456')
      expect(vin.wmiRegion).toEqual({ country: 'Spain', region: 'Europe' })
    })

    it('should identify Germany', () => {
      const vin = Vin.create('WAUZZZ8V5JA123456')
      expect(vin.wmiRegion).toEqual({ country: 'Germany', region: 'Europe' })
    })

    it('should identify Japan', () => {
      const vin = Vin.create('JKAZR2A1XLA000111')
      expect(vin.wmiRegion).toEqual({ country: 'Japan', region: 'Asia' })
    })

    it('should identify United States', () => {
      const vin = Vin.create('1M8GDM9AXKP042788')
      expect(vin.wmiRegion).toEqual({ country: 'United States', region: 'North America' })
    })

    it('should return null for unknown WMI', () => {
      const vin = Vin.create('99ZZZZ8V5JA123456')
      expect(vin.wmiRegion).toBeNull()
    })
  })
})
