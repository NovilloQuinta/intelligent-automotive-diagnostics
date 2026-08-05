import { describe, it, expect } from 'vitest'
import { pidDefinitionsToFormulaEntries } from '@/infrastructure/elm327/pidDefinitionMapper.js'
import type { PidFormulaSource } from '@/infrastructure/elm327/pidDefinitionMapper.js'

describe('pidDefinitionMapper', () => {
  describe('pidDefinitionsToFormulaEntries', () => {
    it('should return empty array for empty input', () => {
      expect(pidDefinitionsToFormulaEntries([])).toEqual([])
    })

    it('should convert definitions with string formulas to entries', () => {
      const defs: PidFormulaSource[] = [
        { pidCode: { key: '01 0C' }, formula: '(A*256+B)/4', dataBytes: 2 },
        { pidCode: { key: '01 05' }, formula: 'A-40', dataBytes: 1 },
      ]
      const entries = pidDefinitionsToFormulaEntries(defs)
      expect(entries).toHaveLength(2)
      expect(entries[0]![0]).toBe('01 0C')
      expect(entries[0]![1]).toEqual({ formula: '(A*256+B)/4', dataBytes: 2 })
      expect(entries[1]![0]).toBe('01 05')
      expect(entries[1]![1]).toEqual({ formula: 'A-40', dataBytes: 1 })
    })

    it('should filter out definitions with empty formula', () => {
      const defs: PidFormulaSource[] = [
        { pidCode: { key: '09 02' }, formula: '', dataBytes: 17 },
        { pidCode: { key: '01 0C' }, formula: '(A*256+B)/4', dataBytes: 2 },
      ]
      const entries = pidDefinitionsToFormulaEntries(defs)
      expect(entries).toHaveLength(1)
      expect(entries[0]![0]).toBe('01 0C')
    })

    it('should accept formula objects with toString()', () => {
      const formulaObj = { toString: () => 'A-40' }
      const defs: PidFormulaSource[] = [
        { pidCode: { key: '01 05' }, formula: formulaObj, dataBytes: 1 },
      ]
      const entries = pidDefinitionsToFormulaEntries(defs)
      expect(entries).toHaveLength(1)
      expect(entries[0]![1]).toEqual({ formula: 'A-40', dataBytes: 1 })
    })
  })
})
