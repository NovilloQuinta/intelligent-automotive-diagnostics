import { describe, it, expect } from 'vitest'
import { resolveCanBus } from '@/infrastructure/elm327/protocolNumber.js'

describe('resolveCanBus', () => {
  it('should resolve protocol 6 to CAN 11-bit at 500 kbps', () => {
    expect(resolveCanBus('6')).toEqual({
      number: '6',
      label: 'CAN_11_500',
      functionalAddress: '7DF',
      ecmRequestAddress: '7E0',
      ecmResponseAddress: '7E8',
    })
  })

  it('should resolve protocol 7 to CAN 29-bit at 500 kbps', () => {
    expect(resolveCanBus('7')).toEqual({
      number: '7',
      label: 'CAN_29_500',
      functionalAddress: '18DB33F1',
      ecmRequestAddress: '18DA10F1',
      ecmResponseAddress: '18DAF110',
    })
  })

  it('should resolve protocol 8 to CAN 11-bit at 250 kbps', () => {
    expect(resolveCanBus('8')).toMatchObject({
      label: 'CAN_11_250',
      functionalAddress: '7DF',
    })
  })

  it('should resolve protocol 9 to CAN 29-bit at 250 kbps', () => {
    expect(resolveCanBus('9')).toMatchObject({
      label: 'CAN_29_250',
      functionalAddress: '18DB33F1',
    })
  })

  it.each([
    ['1', 'SAE J1850 PWM'],
    ['2', 'SAE J1850 VPW'],
    ['3', 'ISO 9141-2'],
    ['4', 'ISO 14230-4 KWP slow init'],
    ['5', 'ISO 14230-4 KWP fast init'],
  ])('should return null for pre-CAN protocol %s (%s)', (raw) => {
    expect(resolveCanBus(raw)).toBeNull()
  })

  it('should return null for J1939, which is out of scope for OBD-II scanning', () => {
    // `ATDPN` devuelve un solo caracter, con `A` delante si el protocolo se
    // negocio en automatico: `A` suelto es ambiguo entre "J1939" y "automatico".
    // Da igual — las dos lecturas caen fuera del barrido, asi que el resultado
    // es el mismo.
    expect(resolveCanBus('A')).toBeNull()
    expect(resolveCanBus('AA')).toBeNull()
  })

  it('should ignore the automatic-negotiation prefix', () => {
    expect(resolveCanBus('A6')).toEqual(resolveCanBus('6'))
    expect(resolveCanBus('A7')).toEqual(resolveCanBus('7'))
  })

  it('should tolerate the raw adapter response with terminators and prompt', () => {
    expect(resolveCanBus('A6\r\r>')).toEqual(resolveCanBus('6'))
    expect(resolveCanBus('\r6\r>')).toEqual(resolveCanBus('6'))
  })

  it('should be case-insensitive on the automatic prefix', () => {
    expect(resolveCanBus('a6')).toEqual(resolveCanBus('6'))
  })

  it.each(['', ' ', '?', 'BUS INIT: ERROR', 'NO DATA', 'STOPPED', '66', 'X'])(
    'should return null when the adapter answers %o instead of a protocol',
    (raw) => {
      expect(resolveCanBus(raw)).toBeNull()
    },
  )

  it('should never derive the ECM response address from the request by subtracting 8 in 29-bit', () => {
    // En 11 bits la respuesta es peticion + 8; en 29 bits se intercambian los
    // dos ultimos bytes. Confundirlos daria `18DA10F9`, que no existe en el bus.
    const bus = resolveCanBus('7')
    expect(bus?.ecmResponseAddress).toBe('18DAF110')
  })
})
