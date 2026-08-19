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

    it('should throw EcuAddressError for a width that is neither 11-bit nor 29-bit', () => {
      expect(() => resolveEcuAddress('7E8A')).toThrow(EcuAddressError)
      expect(() => resolveEcuAddress('18DAF1')).toThrow(EcuAddressError)
      expect(() => resolveEcuAddress('18DAF11000')).toThrow(EcuAddressError)
    })

    it('should resolve the 29-bit ECM address', () => {
      expect(resolveEcuAddress('18DAF110')).toEqual({
        type: 'ECM',
        name: 'Engine Control Module',
        requestAddr: '18DA10F1',
      })
    })

    it('should derive the 29-bit request address by swapping the last two bytes', () => {
      // No es "respuesta menos 8" como en 11 bits: en 29 bits el destinatario y el
      // origen intercambian sitio. `18DAF111` responde, `18DA11F1` pregunta.
      expect(resolveEcuAddress('18DAF111')).toEqual({
        type: 'UNKNOWN',
        name: 'ECU 18DAF111',
        requestAddr: '18DA11F1',
      })
    })

    it('should not name 29-bit ECUs it does not know', () => {
      expect(resolveEcuAddress('18DAF11B').type).toBe('UNKNOWN')
      expect(resolveEcuAddress('18DAF11B').requestAddr).toBe('18DA1BF1')
    })

    it('should normalize lowercase 29-bit input', () => {
      expect(resolveEcuAddress('18daf110')).toEqual(resolveEcuAddress('18DAF110'))
    })
  })
})
