import { describe, it, expect } from 'vitest'
import { createPidFormulaCatalog } from '@/infrastructure/elm327/pidFormulas.js'
import { STANDARD_MODE_01_PIDS } from '@/infrastructure/persistence/sqlite/seed-pids.js'

describe('pidFormulas', () => {
  const catalog = createPidFormulaCatalog()

  describe('get(mode, pid)', () => {
    it('should return formula entry for Mode 01 PID 0C (RPM)', () => {
      const entry = catalog.get('01', '0C')
      expect(entry).toEqual({ formula: '(A*256+B)/4', dataBytes: 2 })
    })

    it('should return formula entry for Mode 22 VAG DID 1130 (Engine Speed)', () => {
      const entry = catalog.get('22', '1130')
      expect(entry).toEqual({ formula: '(A*256+B)/4', dataBytes: 2 })
    })

    it('should return undefined for unknown PID', () => {
      const entry = catalog.get('01', 'ZZ')
      expect(entry).toBeUndefined()
    })
  })

  describe('apply(mode, pid, bytes)', () => {
    it('should compute RPM from Mode 01 0C bytes [0C, 80] → 800', () => {
      expect(catalog.apply('01', '0C', [0x0c, 0x80])).toBe(800)
    })

    it('should compute coolant temp from Mode 01 05 byte [82] → 90', () => {
      expect(catalog.apply('01', '05', [0x82])).toBe(90)
    })

    it('should compute RPM from Mode 22 DID 1130 bytes [0C, 80] → 800', () => {
      expect(catalog.apply('22', '1130', [0x0c, 0x80])).toBe(800)
    })

    it('should compute coolant temp from Mode 22 DID F430 byte [5A] → 90', () => {
      expect(catalog.apply('22', 'F430', [0x5a])).toBe(90)
    })

    it('should fallback to big-endian for unknown PID [0C, 80] → 3200', () => {
      expect(catalog.apply('01', 'XX', [0x0c, 0x80])).toBe(3200)
    })
  })

  describe('parity with STANDARD_MODE_01_PIDS', () => {
    it('should match formula and dataBytes for all 16 standard PIDs', () => {
      for (const pid of STANDARD_MODE_01_PIDS) {
        const entry = catalog.get(pid.pidCode.mode, pid.pidCode.pid)
        expect(entry, `Missing formula for ${pid.pidCode.key}`).toBeDefined()
        expect(entry!.formula, `Formula mismatch for ${pid.pidCode.key}`).toBe(pid.formula)
        expect(entry!.dataBytes, `dataBytes mismatch for ${pid.pidCode.key}`).toBe(pid.dataBytes)
      }
    })

    it('should have exactly 16 Mode 01 entries (no more, no less)', () => {
      const count = STANDARD_MODE_01_PIDS.filter((pid) => {
        const entry = catalog.get(pid.pidCode.mode, pid.pidCode.pid)
        return entry !== undefined && entry.formula === pid.formula
      }).length
      expect(count).toBe(16)
    })
  })
})
