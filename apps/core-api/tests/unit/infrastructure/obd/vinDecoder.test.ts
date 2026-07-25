import { describe, it, expect } from 'vitest'
import { decodeVin } from '@/infrastructure/obd/vinDecoder.js'
import { VinDecodeError } from '@/domain/vin.js'

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
      const bytes = 'WAIZZZ8V5JA123456'.split('').map((c) => c.charCodeAt(0))
      expect(() => decodeVin(bytes)).toThrow(VinDecodeError)
    })

    it('should convert lowercase to uppercase', () => {
      const bytes = 'wauzzz8v5ja123456'.split('').map((c) => c.charCodeAt(0))
      const result = decodeVin(bytes)
      expect(result).toBe('WAUZZZ8V5JA123456')
    })
  })
})
