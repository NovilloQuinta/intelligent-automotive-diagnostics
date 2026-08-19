import { describe, it, expect } from 'vitest'
import { DtcCode, DtcCodeError } from '@/domain/value-objects/DtcCode.js'

describe('DtcCode', () => {
  it('should reject a code that does not match SAE J2012', () => {
    expect(() => new DtcCode({ code: 'X9999' })).toThrow(DtcCodeError)
  })

  it('should decode a byte pair into its SAE J2012 code', () => {
    expect(DtcCode.decodeFromBytes(0x03, 0x01)).toBe('P0301')
    expect(DtcCode.decodeFromBytes(0x20, 0x02)).toBe('P2002')
  })

  describe('origen en el bus', () => {
    it('should keep the reporting ECU address when the bus provides it', () => {
      expect(new DtcCode({ code: 'P0301', ecuAddress: '7E8' }).ecuAddress).toBe('7E8')
    })

    it('should stay valid without an ECU address', () => {
      // Con los headers apagados el bus no dice quien reporta. El codigo sigue
      // siendo un DTC legitimo: el origen es informacion adicional, no un requisito.
      const dtc = new DtcCode({ code: 'P0301' })

      expect(dtc.ecuAddress).toBeUndefined()
      expect(dtc.code).toBe('P0301')
    })

    it('should normalize the address to uppercase', () => {
      expect(new DtcCode({ code: 'P0301', ecuAddress: '18daf110' }).ecuAddress).toBe('18DAF110')
    })
  })
})
