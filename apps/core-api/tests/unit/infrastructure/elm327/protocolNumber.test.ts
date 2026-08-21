import { describe, it, expect } from 'vitest'
import { resolveCanBus } from '@/infrastructure/elm327/protocolNumber.js'
import { resolveCanBusByNumber } from '@/domain/catalogs/ecuAddressCatalog.js'

describe('resolveCanBus', () => {
  it('should hand the parsed protocol number to the ISO 15765-4 catalog', () => {
    // La tabla numero -> bus es normativa y se prueba en el dominio
    // (`ecuAddressCatalog.test.ts`). Aqui solo importa que el numero extraido de
    // la respuesta llegue hasta ella.
    expect(resolveCanBus('6')).toEqual(resolveCanBusByNumber('6'))
    expect(resolveCanBus('9')).toEqual(resolveCanBusByNumber('9'))
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

  it('should tolerate the command echo, which is on until AT E0 runs', () => {
    // `AT DPN` es el primer comando del barrido, antes de que `AT E0` apague el
    // eco, asi que la respuesta llega con el comando repetido delante. Verificado
    // contra el ELM327-emulator: devuelve "AT DPN\rA6\r\r>".
    expect(resolveCanBus('AT DPN\rA6\r\r>')).toEqual(resolveCanBus('6'))
    expect(resolveCanBus('ATDPN\rA6\r>')).toEqual(resolveCanBus('6'))
  })

  it('should not mistake the echoed command for an answer', () => {
    // Sin respuesta detras del eco no hay protocolo que devolver.
    expect(resolveCanBus('AT DPN\r\r>')).toBeNull()
  })

  it.each(['', ' ', '?', 'BUS INIT: ERROR', 'NO DATA', 'STOPPED', '66', 'X'])(
    'should return null when the adapter answers %o instead of a protocol',
    (raw) => {
      expect(resolveCanBus(raw)).toBeNull()
    },
  )
})
