import { describe, it, expect } from 'vitest'
import { dtcDescribe } from '@/domain/dtcCatalog.js'

describe('dtcCatalog', () => {
  describe('dtcDescribe', () => {
    it('devuelve la descripcion SAE J2012 para un codigo presente', () => {
      expect(dtcDescribe('P0301')).toBe('Cylinder 1 Misfire Detected')
      expect(dtcDescribe('P0401')).toBe('Exhaust Gas Recirculation Flow Insufficient Detected')
      expect(dtcDescribe('P2002')).toBe('Diesel Particulate Filter Efficiency Below Threshold (Bank 1)')
    })

    it('es case-insensitive', () => {
      expect(dtcDescribe('p0301')).toBe('Cylinder 1 Misfire Detected')
      expect(dtcDescribe(' P0301 ')).toBe('Cylinder 1 Misfire Detected')
    })

    it('devuelve cadena vacia para un codigo ausente del catalogo', () => {
      expect(dtcDescribe('P9999')).toBe('')
    })

    it('nunca deriva la descripcion de la familia del codigo', () => {
      expect(dtcDescribe('P0307')).toBe('')
      expect(dtcDescribe('P0499')).toBe('')
      expect(dtcDescribe('P20FF')).toBe('')
    })
  })
})
