import { describe, it, expect } from 'vitest'
import { evaluatePid, PidParseError } from '@/infrastructure/obd/protocol/pidParser.js'

describe('evaluatePid', () => {
  // ─── 1. Un test por cada fórmula de PID del catálogo (20 tests) ───

  describe('PID catalog formulas', () => {
    it('01 04 — Calculated Engine Load: A*100/255', () => {
      expect(evaluatePid('A*100/255', [0x80])).toBeCloseTo(50.196)
    })

    it('01 05 — Engine Coolant Temperature: A-40', () => {
      expect(evaluatePid('A-40', [0x5a])).toBe(50)
    })

    it('01 06 — Short Term Fuel Trim: A*100/128-100 (zero)', () => {
      expect(evaluatePid('A*100/128-100', [0x80])).toBe(0)
    })

    it('01 06 — Short Term Fuel Trim: A*100/128-100 (lean)', () => {
      expect(evaluatePid('A*100/128-100', [0x9b])).toBeCloseTo(21.093)
    })

    it('01 07 — Long Term Fuel Trim: A*100/128-100', () => {
      expect(evaluatePid('A*100/128-100', [0x80])).toBe(0)
    })

    it('01 0B — Intake Manifold Absolute Pressure: A', () => {
      expect(evaluatePid('A', [0x64])).toBe(100)
    })

    it('01 0C — Engine RPM: (A*256+B)/4 (idle)', () => {
      expect(evaluatePid('(A*256+B)/4', [0x0c, 0x77])).toBeCloseTo(797.75)
    })

    it('01 0C — Engine RPM: (A*256+B)/4 (high)', () => {
      expect(evaluatePid('(A*256+B)/4', [0x1e, 0x60])).toBe(1944)
    })

    it('01 0D — Vehicle Speed: A', () => {
      expect(evaluatePid('A', [0x78])).toBe(120)
    })

    it('01 0E — Timing Advance: A/2-64', () => {
      expect(evaluatePid('A/2-64', [0x80])).toBe(0)
    })

    it('01 0F — Intake Air Temperature: A-40', () => {
      expect(evaluatePid('A-40', [0x46])).toBe(30)
    })

    it('01 10 — Mass Air Flow Rate: (A*256+B)/100', () => {
      expect(evaluatePid('(A*256+B)/100', [0x01, 0xf4])).toBeCloseTo(5.0)
    })

    it('01 11 — Throttle Position: A*100/255 (full)', () => {
      expect(evaluatePid('A*100/255', [0xff])).toBe(100)
    })

    it('01 2F — Fuel Tank Level Input: A*100/255', () => {
      expect(evaluatePid('A*100/255', [0x80])).toBeCloseTo(50.196)
    })

    it('01 31 — Distance Traveled Since Codes Cleared: A*256+B', () => {
      expect(evaluatePid('A*256+B', [0x01, 0x2c])).toBe(300)
    })

    it('01 42 — Control Module Voltage: (A*256+B)/1000', () => {
      expect(evaluatePid('(A*256+B)/1000', [0x2e, 0xe0])).toBe(12.0)
    })

    it('01 46 — Ambient Air Temperature: A-40', () => {
      expect(evaluatePid('A-40', [0x50])).toBe(40)
    })

    it('01 5C — Engine Oil Temperature: A-40', () => {
      expect(evaluatePid('A-40', [0x6e])).toBe(70)
    })

    it('22 0300 — TCU Odometer: (A<<24|B<<16|C<<8|D)/10', () => {
      expect(evaluatePid('(A<<24|B<<16|C<<8|D)/10', [0x00, 0x03, 0xc0, 0xb8])).toBeCloseTo(24594.4)
    })

    it('22 0400 — ECM Odometer: (A<<24|B<<16|C<<8|D)/10', () => {
      expect(evaluatePid('(A<<24|B<<16|C<<8|D)/10', [0x00, 0x01, 0x86, 0xa0])).toBe(10000)
    })

    it('22 7A76 — Hybrid Battery SOC: A*0.5', () => {
      expect(evaluatePid('A*0.5', [0x96])).toBe(75)
    })

    it('22 7A53 — Hybrid Battery Voltage: (A*256+B)*0.01', () => {
      expect(evaluatePid('(A*256+B)*0.01', [0x00, 0xc8])).toBe(2.0)
    })
  })

  // ─── 2. Operadores y precedencia (8 tests) ───

  describe('operator handling', () => {
    it('should handle bitwise OR', () => {
      // 0x01 | 0xa4 = 0xa5 = 165
      expect(evaluatePid('A|B', [0x01, 0xa4])).toBe(165)
    })

    it('should handle bitwise AND', () => {
      expect(evaluatePid('A&B', [0xff, 0x0f])).toBe(0x0f)
    })

    it('should handle left shift', () => {
      expect(evaluatePid('A<<8', [0x01])).toBe(256)
    })

    it('should handle right shift', () => {
      expect(evaluatePid('A>>2', [0x10])).toBe(4)
    })

    it('should respect shift precedence over OR', () => {
      // A=1, B=0xA4: (1<<8)|0xA4 = 256|164 = 420
      expect(evaluatePid('A<<8|B', [0x01, 0xa4])).toBe(0x01a4)
    })

    it('should respect multiplication before addition', () => {
      expect(evaluatePid('A*2+3', [0x05])).toBe(13)
    })

    it('should respect parentheses over precedence', () => {
      expect(evaluatePid('A*(2+3)', [0x05])).toBe(25)
    })

    it('should handle unary minus', () => {
      expect(evaluatePid('-A+5', [0x03])).toBe(2)
    })
  })

  // ─── 3. Variable especial raw (3 tests) ───

  describe('raw variable', () => {
    it('should compute raw as big-endian integer of all bytes', () => {
      expect(evaluatePid('raw', [0x01, 0xf4])).toBe(500)
    })

    it('should evaluate raw in formula context', () => {
      expect(evaluatePid('raw-40', [0x5a])).toBe(50)
    })

    it('should evaluate raw/10 with 3 bytes', () => {
      expect(evaluatePid('raw/10', [0x00, 0x03, 0x0c])).toBe(78)
    })
  })

  // ─── 4. Edge cases (11 tests) ───

  describe('edge cases', () => {
    it('should throw on empty formula', () => {
      expect(() => evaluatePid('', [0x00])).toThrow(PidParseError)
    })

    it('should throw on division by zero', () => {
      expect(() => evaluatePid('A/0', [0x05])).toThrow(PidParseError)
    })

    it('should throw on invalid character', () => {
      expect(() => evaluatePid('A$5', [0x00])).toThrow(PidParseError)
    })

    it('should throw on unknown variable', () => {
      expect(() => evaluatePid('Z+1', [0x00])).toThrow(PidParseError)
    })

    it('should throw on variable beyond available bytes', () => {
      expect(() => evaluatePid('C*2', [0x00])).toThrow(PidParseError)
    })

    it('should throw on missing closing parenthesis', () => {
      expect(() => evaluatePid('(A*2', [0x05])).toThrow(PidParseError)
    })

    it('should throw on extra closing parenthesis', () => {
      expect(() => evaluatePid('A)', [0x05])).toThrow(PidParseError)
    })

    it('should handle negative result', () => {
      expect(evaluatePid('A-40', [0x00])).toBe(-40)
    })

    it('should handle whitespace in formula', () => {
      expect(evaluatePid(' A - 40 ', [0x5a])).toBe(50)
    })

    it('should throw on consecutive operators', () => {
      expect(() => evaluatePid('A+*2', [0x05])).toThrow(PidParseError)
    })

    it('should handle decimal constant', () => {
      expect(evaluatePid('A*0.352', [0x64])).toBeCloseTo(35.2)
    })
  })
})
