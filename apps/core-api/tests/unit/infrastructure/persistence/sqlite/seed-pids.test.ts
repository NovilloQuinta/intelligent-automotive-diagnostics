import { describe, it, expect } from 'vitest'
import { ALL_SEED_PIDS } from '@/infrastructure/persistence/sqlite/seed-pids.js'

describe('seed-pids', () => {
  describe('ALL_SEED_PIDS', () => {
    it('should have 16 entries total (Mode 01 only)', () => {
      expect(ALL_SEED_PIDS).toHaveLength(16)
    })

    it('should contain only universal SAE J1979 PIDs (Mode 01), no manufacturer Mode 22', () => {
      const modes = new Set(ALL_SEED_PIDS.map((p) => p.pidCode.mode))
      expect(modes).toEqual(new Set(['01']))
    })
  })
})
