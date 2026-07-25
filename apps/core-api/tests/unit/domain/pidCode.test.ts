import { describe, it, expect } from 'vitest'
import { PidCode, PidCodeError } from '@/domain/pidCode.js'

describe('PidCode', () => {
  describe('PidCode.create', () => {
    it('should create a PidCode from valid mode and pid', () => {
      const pid = PidCode.create('01', '0C')
      expect(pid.mode).toBe('01')
      expect(pid.pid).toBe('0C')
      expect(pid.key).toBe('01 0C')
      expect(pid.toString()).toBe('01 0C')
    })

    it('should uppercase mode and pid', () => {
      const pid = PidCode.create('0a', '0c')
      expect(pid.mode).toBe('0A')
      expect(pid.pid).toBe('0C')
    })

    it('should accept 4-char PID for enhanced mode 22', () => {
      const pid = PidCode.create('22', '0300')
      expect(pid.key).toBe('22 0300')
    })

    it('should reject 4-char PID for standard mode 01', () => {
      expect(() => PidCode.create('01', '0300')).toThrow(PidCodeError)
    })

    it('should reject 4-char PID for standard mode 09', () => {
      expect(() => PidCode.create('09', '1234')).toThrow(PidCodeError)
    })

    it('should accept 2-char PID for standard mode 09', () => {
      const pid = PidCode.create('09', '02')
      expect(pid.key).toBe('09 02')
    })

    it('should throw PidCodeError for empty mode', () => {
      expect(() => PidCode.create('', '0C')).toThrow(PidCodeError)
    })

    it('should throw PidCodeError for empty pid', () => {
      expect(() => PidCode.create('01', '')).toThrow(PidCodeError)
    })

    it('should throw PidCodeError when mode is not exactly 2 hex digits', () => {
      expect(() => PidCode.create('1', '0C')).toThrow(PidCodeError)
      expect(() => PidCode.create('ABC', '0C')).toThrow(PidCodeError)
      expect(() => PidCode.create('XX', '0C')).toThrow(PidCodeError)
    })

    it('should throw PidCodeError when pid is less than 2 hex digits', () => {
      expect(() => PidCode.create('01', 'C')).toThrow(PidCodeError)
    })

    it('should throw PidCodeError when pid is more than 4 hex digits', () => {
      expect(() => PidCode.create('01', '03000')).toThrow(PidCodeError)
    })

    it('should throw PidCodeError when pid contains non-hex chars', () => {
      expect(() => PidCode.create('01', 'XX')).toThrow(PidCodeError)
      expect(() => PidCode.create('01', '@G')).toThrow(PidCodeError)
    })

    it('should accept mode with letters A-F', () => {
      const pid = PidCode.create('0A', '0C')
      expect(pid.mode).toBe('0A')
    })

    it('should accept the full hex range for PID', () => {
      const pid = PidCode.create('22', 'ABCD')
      expect(pid.pid).toBe('ABCD')
    })
  })
})
