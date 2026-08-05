import { describe, it, expect } from 'vitest'
import { createPidFormulaCatalog } from '@/infrastructure/elm327/pidFormulas.js'
import type { PidFormulaEntry } from '@/infrastructure/elm327/pidFormulas.js'

describe('pidFormulas', () => {
  describe('createPidFormulaCatalog', () => {
    it('should return undefined from get() when catalog is empty', () => {
      const catalog = createPidFormulaCatalog([])
      expect(catalog.get('01', '0C')).toBeUndefined()
    })

    it('should use big-endian fallback from apply() when catalog is empty', () => {
      const catalog = createPidFormulaCatalog([])
      expect(catalog.apply('01', '0C', [0x0c, 0x80])).toBe(3200)
    })

    it('should get and apply Mode 01 PID 0C (RPM) with the correct formula', () => {
      const entries: Array<readonly [string, PidFormulaEntry]> = [
        ['01 0C', { formula: '(A*256+B)/4', dataBytes: 2 }],
      ]
      const catalog = createPidFormulaCatalog(entries)
      expect(catalog.get('01', '0C')).toEqual({ formula: '(A*256+B)/4', dataBytes: 2 })
      expect(catalog.apply('01', '0C', [0x0c, 0x80])).toBe(800)
    })

    it('should get and apply Mode 22 DID 1130 (Engine Speed) correctly', () => {
      const entries: Array<readonly [string, PidFormulaEntry]> = [
        ['22 1130', { formula: '(A*256+B)/4', dataBytes: 2 }],
      ]
      const catalog = createPidFormulaCatalog(entries)
      expect(catalog.get('22', '1130')).toEqual({ formula: '(A*256+B)/4', dataBytes: 2 })
      expect(catalog.apply('22', '1130', [0x0c, 0x80])).toBe(800)
    })

    it('should fallback to big-endian for unknown PID', () => {
      const catalog = createPidFormulaCatalog([])
      expect(catalog.apply('01', 'XX', [0x0c, 0x80])).toBe(3200)
    })

    it('should compute coolant temp from Mode 01 05 byte [82] → 90', () => {
      const entries: Array<readonly [string, PidFormulaEntry]> = [
        ['01 05', { formula: 'A-40', dataBytes: 1 }],
      ]
      const catalog = createPidFormulaCatalog(entries)
      expect(catalog.apply('01', '05', [0x82])).toBe(90)
    })

    it('should compute coolant temp from Mode 22 DID F430 byte [5A] → 90', () => {
      const entries: Array<readonly [string, PidFormulaEntry]> = [
        ['22 F430', { formula: 'A', dataBytes: 1 }],
      ]
      const catalog = createPidFormulaCatalog(entries)
      expect(catalog.apply('22', 'F430', [0x5a])).toBe(90)
    })
  })

  describe('case insensitivity', () => {
    it('should normalize mode and pid to uppercase in get()', () => {
      const entries: Array<readonly [string, PidFormulaEntry]> = [
        ['01 0C', { formula: '(A*256+B)/4', dataBytes: 2 }],
      ]
      const catalog = createPidFormulaCatalog(entries)
      expect(catalog.get('01', '0c')).toEqual({ formula: '(A*256+B)/4', dataBytes: 2 })
      expect(catalog.get('01', '0C')).toEqual({ formula: '(A*256+B)/4', dataBytes: 2 })
    })

    it('should normalize mode and pid to uppercase in apply()', () => {
      const entries: Array<readonly [string, PidFormulaEntry]> = [
        ['01 0C', { formula: '(A*256+B)/4', dataBytes: 2 }],
      ]
      const catalog = createPidFormulaCatalog(entries)
      expect(catalog.apply('01', '0c', [0x0c, 0x80])).toBe(800)
      expect(catalog.apply('01', '0C', [0x0c, 0x80])).toBe(800)
    })
  })
})
