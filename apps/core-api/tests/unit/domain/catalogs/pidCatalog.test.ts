import { describe, it, expect } from 'vitest'
import {
  ALL_SEED_PIDS,
  AUTO_DISCOVERY_PID_FORMULA,
  AUTO_DISCOVERY_PID_DATA_BYTES,
} from '@/domain/catalogs/pidCatalog.js'
import { evaluatePid } from '@/domain/services/pidFormula.js'

describe('seed-pids', () => {
  describe('ALL_SEED_PIDS', () => {
    it('should have 16 entries total (Mode 01 only)', () => {
      expect(ALL_SEED_PIDS).toHaveLength(16)
    })

    it('should contain only universal SAE J1979 PIDs (Mode 01), no manufacturer Mode 22', () => {
      const modes = new Set(ALL_SEED_PIDS.map((p) => p.pidCode.mode))
      expect(modes).toEqual(new Set(['01']))
    })

    it('should label Mode 01 PIDs with their system (Engine by default)', () => {
      const byPid = new Map(ALL_SEED_PIDS.map((p) => [p.pidCode.pid, p]))

      expect(byPid.get('0C')!.system).toBe('Engine') // Engine RPM
      expect(byPid.get('0D')!.system).toBe('Vehicle') // Vehicle Speed
      expect(byPid.get('2F')!.system).toBe('Vehicle') // Fuel Tank Level
      expect(byPid.get('46')!.system).toBe('Vehicle') // Ambient Air Temperature
      expect(byPid.get('04')!.system).toBe('Engine') // Calculated Engine Load
    })

    it('should assign a system label to every Mode 01 PID', () => {
      expect(ALL_SEED_PIDS.length).toBeGreaterThan(0)
      expect(ALL_SEED_PIDS.every((p) => p.system !== undefined && p.system !== '')).toBe(true)

      const vehicleScoped = ALL_SEED_PIDS.filter((p) => p.system === 'Vehicle').map(
        (p) => p.pidCode.pid,
      )
      expect(vehicleScoped.sort()).toEqual(['0D', '2F', '46'])
    })
  })
})

describe('auto-discovery PID defaults', () => {
  it('should assume a 2-byte big-endian formula for an unknown PID', () => {
    expect(AUTO_DISCOVERY_PID_FORMULA).toBe('(A*256+B)')
    expect(AUTO_DISCOVERY_PID_DATA_BYTES).toBe(2)
  })

  it('should be evaluable by the domain formula evaluator over its own byte count', () => {
    const bytes = [0x12, 0x34].slice(0, AUTO_DISCOVERY_PID_DATA_BYTES)
    expect(evaluatePid(AUTO_DISCOVERY_PID_FORMULA, bytes)).toBe(0x1234)
  })
})
