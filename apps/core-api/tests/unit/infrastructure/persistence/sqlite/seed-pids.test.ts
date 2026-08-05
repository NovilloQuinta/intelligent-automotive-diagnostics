import { describe, it, expect } from 'vitest'
import {
  VAG_AUDI_MODE_22_PIDS,
  ALL_SEED_PIDS,
} from '@/infrastructure/persistence/sqlite/seed-pids.js'

describe('seed-pids', () => {
  describe('VAG_AUDI_MODE_22_PIDS', () => {
    it('should have 16 VAG Mode 22 DID entries', () => {
      expect(VAG_AUDI_MODE_22_PIDS).toHaveLength(16)
    })

    it('should have all entries with mode "22"', () => {
      for (const entry of VAG_AUDI_MODE_22_PIDS) {
        expect(entry.pidCode.mode).toBe('22')
      }
    })

    it('should have DID 1130 with formula (A*256+B)/4 and dataBytes 2', () => {
      const did = VAG_AUDI_MODE_22_PIDS.find((p) => p.pidCode.pid === '1130')
      expect(did).toBeDefined()
      expect(did!.formula).toBe('(A*256+B)/4')
      expect(did!.dataBytes).toBe(2)
    })

    it('should have DID F430 with formula A and dataBytes 1', () => {
      const did = VAG_AUDI_MODE_22_PIDS.find((p) => p.pidCode.pid === 'F430')
      expect(did).toBeDefined()
      expect(did!.formula).toBe('A')
      expect(did!.dataBytes).toBe(1)
    })
  })

  describe('ALL_SEED_PIDS', () => {
    it('should have 37 entries total (21 current + 16 VAG)', () => {
      expect(ALL_SEED_PIDS).toHaveLength(37)
    })
  })
})
