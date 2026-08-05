import { describe, it, expect } from 'vitest'
import { Vin, VinDecodeError } from '@/domain/value-objects/vin.js'

describe('Vin', () => {
  describe('Vin', () => {
    it('should create a Vin from a valid 17-char string', () => {
      const vin = new Vin('WAUZZZ8V5JA123456')
      expect(vin.value).toBe('WAUZZZ8V5JA123456')
      expect(vin.toString()).toBe('WAUZZZ8V5JA123456')
    })

    it('should uppercase input', () => {
      const vin = new Vin('wauzzz8v5ja123456')
      expect(vin.value).toBe('WAUZZZ8V5JA123456')
    })

    it('should strip whitespace', () => {
      const vin = new Vin('  WAUZZZ8V5JA123456  ')
      expect(vin.value).toBe('WAUZZZ8V5JA123456')
    })

    it('should throw VinDecodeError when length is not 17', () => {
      expect(() => new Vin('SHORT')).toThrow(VinDecodeError)
      expect(() => new Vin('WAYTOOLONGVINSTRING')).toThrow(VinDecodeError)
    })

    it('should throw VinDecodeError for empty string', () => {
      expect(() => new Vin('')).toThrow(VinDecodeError)
    })

    it('should throw VinDecodeError for whitespace-only string', () => {
      expect(() => new Vin('                 ')).toThrow(VinDecodeError)
    })

    it('should throw VinDecodeError when containing forbidden character I', () => {
      expect(() => new Vin('WAIZZZ8V5JA123456')).toThrow(VinDecodeError)
    })

    it('should throw VinDecodeError when containing forbidden character O', () => {
      expect(() => new Vin('WAOZZZ8V5JA123456')).toThrow(VinDecodeError)
    })

    it('should throw VinDecodeError when containing forbidden character Q', () => {
      expect(() => new Vin('WAQZZZ8V5JA123456')).toThrow(VinDecodeError)
    })

    it('should throw VinDecodeError when containing non-alphanumeric chars', () => {
      expect(() => new Vin('WAU_ZZ8V5JA123456')).toThrow(VinDecodeError)
    })

    it('should throw VinDecodeError when containing special characters', () => {
      expect(() => new Vin('WAU#Z$8V5JA123456')).toThrow(VinDecodeError)
      expect(() => new Vin('WAU@ZZ8V5JA123456')).toThrow(VinDecodeError)
    })

    it('should throw VinDecodeError when 17 chars are all forbidden', () => {
      expect(() => new Vin('IIIIIIIIIIIIIIIII')).toThrow(VinDecodeError)
    })

    it('should throw VinDecodeError for lowercase ', () => {
      expect(() => new Vin('waiiiiiv5ja123456')).toThrow(VinDecodeError)
    })

    it('should create a Vin with all valid same character', () => {
      const vin = new Vin('AAAAAAAAAAAAAAAAA')
      expect(vin.value).toBe('AAAAAAAAAAAAAAAAA')
    })

    it('should create a Vin with numeric characters only', () => {
      const vin = new Vin('11111111111111111')
      expect(vin.value).toBe('11111111111111111')
    })
  })

  describe('Vin.isCheckDigitValid', () => {
    it('should return true for correct check digit', () => {
      const vin = new Vin('11111111111111111')
      expect(vin.isCheckDigitValid()).toBe(true)
    })

    it('should return true for valid VIN with correct check digit', () => {
      const vin = new Vin('1M8GDM9AXKP042788')
      expect(vin.isCheckDigitValid()).toBe(true)
    })

    it('should return false for invalid check digit', () => {
      const vin = new Vin('WAUZZZ8V5JA123456')
      expect(vin.isCheckDigitValid()).toBe(false)
    })

    it('should return false for VIN with mismatched check digit', () => {
      const vin = new Vin('1M8GDM9A5KP042788')
      expect(vin.isCheckDigitValid()).toBe(false)
    })
  })

  describe('Vin.wmiRegion', () => {
    it('should identify Spain', () => {
      const vin = new Vin('UXXZZZ8V5JA123456')
      expect(vin.wmiRegion).toEqual({ country: 'Spain', region: 'Europe' })
    })

    it('should identify Germany', () => {
      const vin = new Vin('WAUZZZ8V5JA123456')
      expect(vin.wmiRegion).toEqual({ country: 'Germany', region: 'Europe' })
    })

    it('should identify Japan', () => {
      const vin = new Vin('JKAZR2A1XLA000111')
      expect(vin.wmiRegion).toEqual({ country: 'Japan', region: 'Asia' })
    })

    it('should identify United States', () => {
      const vin = new Vin('1M8GDM9AXKP042788')
      expect(vin.wmiRegion).toEqual({ country: 'United States', region: 'North America' })
    })

    it('should identify Canada (WMI 2xx, no USA)', () => {
      const vin = new Vin('2G1FC1E31C9123456')
      expect(vin.wmiRegion).toEqual({ country: 'Canada', region: 'North America' })
    })

    it('should identify Mexico (WMI 3xx, no USA)', () => {
      const vin = new Vin('3VWC57BU7KM123456')
      expect(vin.wmiRegion).toEqual({ country: 'Mexico', region: 'North America' })
    })

    it('should return null for unknown WMI', () => {
      const vin = new Vin('99ZZZZ8V5JA123456')
      expect(vin.wmiRegion).toBeNull()
    })
  })

  describe('Vin.manufacturer', () => {
    it('should return "Audi" for WAU WMI', () => {
      const vin = new Vin('WAUZZZ8V5JA123456')
      expect(vin.manufacturer).toBe('Audi')
    })

    it('should return "Kawasaki" for JKA WMI', () => {
      const vin = new Vin('JKAZR2A1XLA000111')
      expect(vin.manufacturer).toBe('Kawasaki')
    })

    it('should return "Volkswagen" for WVW WMI', () => {
      const vin = new Vin('WVWZZZ1JZXW123456')
      expect(vin.manufacturer).toBe('Volkswagen')
    })

    it('should return "BMW" for WBA WMI', () => {
      const vin = new Vin('WBA3B5C50J1234567')
      expect(vin.manufacturer).toBe('BMW')
    })

    it('should return "Mercedes-Benz" for WDD WMI', () => {
      const vin = new Vin('WDDGF4HB3CR123456')
      expect(vin.manufacturer).toBe('Mercedes-Benz')
    })

    it('should return "Porsche" for WP0 WMI', () => {
      const vin = new Vin('WP0ZZZ99ZTS390000')
      expect(vin.manufacturer).toBe('Porsche')
    })

    it('should return "Toyota" for JTD WMI (japanese)', () => {
      const vin = new Vin('JTDKB20EX20012345')
      expect(vin.manufacturer).toBe('Toyota')
    })

    it('should return "Honda" for JHM WMI (japanese)', () => {
      const vin = new Vin('JHMCM56557C404321')
      expect(vin.manufacturer).toBe('Honda')
    })

    it('should return "Ford" for WF0 WMI (european)', () => {
      const vin = new Vin('WF0MXXGCM5X123456')
      expect(vin.manufacturer).toBe('Ford')
    })

    it('should return "Chevrolet" for 1G1 WMI (american)', () => {
      const vin = new Vin('1G1BC52E5P7123456')
      expect(vin.manufacturer).toBe('Chevrolet')
    })

    it('should return null for unknown WMI (XTA)', () => {
      const vin = new Vin('XTAZZZ8V5JA123456')
      expect(vin.manufacturer).toBeNull()
    })

    it('should return null for unknown WMI (99 prefix)', () => {
      const vin = new Vin('99ZZZZ8V5JA123456')
      expect(vin.manufacturer).toBeNull()
    })
  })

  describe('Vin.modelYear', () => {
    it('should return 2018 for position 10 "J"', () => {
      const vin = new Vin('WAUZZZ8V5JA123456')
      expect(vin.modelYear).toBe(2018)
    })

    it('should return 2020 for position 10 "L"', () => {
      const vin = new Vin('JKAZR2A1XLA000111')
      expect(vin.modelYear).toBe(2020)
    })

    it('should return 2010 for position 10 "A"', () => {
      const vin = new Vin('WAUZZZ8V5A1234567')
      expect(vin.modelYear).toBe(2010)
    })

    it('should return 2005 for position 10 "5"', () => {
      const vin = new Vin('WF0MXXGCM5X123456')
      expect(vin.modelYear).toBe(2005)
    })

    it('should return 2002 for position 10 "2"', () => {
      const vin = new Vin('JTDKB20EX20012345')
      expect(vin.modelYear).toBe(2002)
    })

    it('should return 2007 for position 10 "7"', () => {
      const vin = new Vin('JHMCM56557C404321')
      expect(vin.modelYear).toBe(2007)
    })

    it('should return 2023 for position 10 "P"', () => {
      const vin = new Vin('1G1BC52E5P7123456')
      expect(vin.modelYear).toBe(2023)
    })

    it('should return 2026 for position 10 "T"', () => {
      const vin = new Vin('WP0ZZZ99ZTS390000')
      expect(vin.modelYear).toBe(2026)
    })

    it('should return null for invalid char "U" at position 10', () => {
      const vin = new Vin('WAUZZZ8V5UA123456')
      expect(vin.modelYear).toBeNull()
    })

    it('should return null for invalid char "Z" at position 10', () => {
      const vin = new Vin('JKAZR2A1XZA000111')
      expect(vin.modelYear).toBeNull()
    })

    it('should return null for invalid char "0" at position 10', () => {
      const vin = new Vin('WP0ZZZ99Z0S390000')
      expect(vin.modelYear).toBeNull()
    })
  })

  describe('fromBytes', () => {
    it('should decode 17 ASCII bytes to valid VIN', () => {
      const bytes = 'WAUZZZ8V5JA123456'.split('').map((c) => c.charCodeAt(0))
      const vin = Vin.fromBytes(bytes)
      expect(vin.value).toBe('WAUZZZ8V5JA123456')
    })

    it('should throw on wrong byte count', () => {
      expect(() => Vin.fromBytes([0x57, 0x41])).toThrow(VinDecodeError)
    })

    it('should throw on forbidden characters in bytes', () => {
      const bytes = 'WAIZZZ8V5JA123456'.split('').map((c) => c.charCodeAt(0))
      expect(() => Vin.fromBytes(bytes)).toThrow(VinDecodeError)
    })

    it('should convert lowercase to uppercase', () => {
      const bytes = 'wauzzz8v5ja123456'.split('').map((c) => c.charCodeAt(0))
      const vin = Vin.fromBytes(bytes)
      expect(vin.value).toBe('WAUZZZ8V5JA123456')
    })
  })
})
