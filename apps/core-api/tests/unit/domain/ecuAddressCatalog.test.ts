import { describe, it, expect } from 'vitest'
import { EcuAddressError, resolveEcuAddress } from '@/domain/ecuAddressCatalog.js'

describe('ecuAddressCatalog', () => {
  describe('resolveEcuAddress', () => {
    it('should resolve 7E8 to the standardized ECM entry', () => {
      expect(resolveEcuAddress('7E8')).toEqual({
        type: 'ECM',
        name: 'Engine Control Module',
        requestAddr: '7E0',
      })
    })

    it('should resolve non-standard addresses to UNKNOWN with derived request address', () => {
      expect(resolveEcuAddress('7E9')).toEqual({
        type: 'UNKNOWN',
        name: 'ECU 7E9',
        requestAddr: '7E1',
      })
      expect(resolveEcuAddress('7DA')).toEqual({
        type: 'UNKNOWN',
        name: 'ECU 7DA',
        requestAddr: '7D2',
      })
      expect(resolveEcuAddress('768')).toEqual({
        type: 'UNKNOWN',
        name: 'ECU 768',
        requestAddr: '760',
      })
      expect(resolveEcuAddress('728')).toEqual({
        type: 'UNKNOWN',
        name: 'ECU 728',
        requestAddr: '720',
      })
    })

    it('should derive requestAddr as response - 8 for an unknown address', () => {
      expect(resolveEcuAddress('7EC')).toEqual({
        type: 'UNKNOWN',
        name: 'ECU 7EC',
        requestAddr: '7E4',
      })
    })

    it('should never assign TCM/ABS/SRS/IPC names to non-standard addresses', () => {
      const resolved = resolveEcuAddress('7E9')
      expect(resolved.type).toBe('UNKNOWN')
      expect(resolved.name).toBe('ECU 7E9')
    })

    it('should normalize lowercase input', () => {
      expect(resolveEcuAddress('7e8')).toEqual({
        type: 'ECM',
        name: 'Engine Control Module',
        requestAddr: '7E0',
      })
    })

    it('should throw EcuAddressError for empty input', () => {
      expect(() => resolveEcuAddress('')).toThrow(EcuAddressError)
    })

    it('should throw EcuAddressError for whitespace-only input', () => {
      expect(() => resolveEcuAddress('   ')).toThrow(EcuAddressError)
    })

    it('should throw EcuAddressError for non-hex input', () => {
      expect(() => resolveEcuAddress('XYZ')).toThrow(EcuAddressError)
    })

    it('should throw EcuAddressError for input longer than 3 digits', () => {
      expect(() => resolveEcuAddress('7E8A')).toThrow(EcuAddressError)
    })
  })
})
