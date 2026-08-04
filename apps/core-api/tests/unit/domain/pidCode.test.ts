import { describe, it, expect } from 'vitest'
import { PidCode, PidCodeError } from '@/domain/value-objects/pidCode.js'

describe('PidCode', () => {
  describe('PidCode', () => {
    it('should create a PidCode from valid mode and pid', () => {
      const pid = new PidCode('01', '0C')
      expect(pid.mode).toBe('01')
      expect(pid.pid).toBe('0C')
      expect(pid.key).toBe('01 0C')
      expect(pid.toString()).toBe('01 0C')
    })

    it('should uppercase mode and pid', () => {
      const pid = new PidCode('0a', '0c')
      expect(pid.mode).toBe('0A')
      expect(pid.pid).toBe('0C')
    })

    it('should accept 4-char PID for enhanced mode 22', () => {
      const pid = new PidCode('22', '0300')
      expect(pid.key).toBe('22 0300')
    })

    it('should reject 4-char PID for standard mode 01', () => {
      expect(() => new PidCode('01', '0300')).toThrow(PidCodeError)
    })

    it('should reject 4-char PID for standard mode 09', () => {
      expect(() => new PidCode('09', '1234')).toThrow(PidCodeError)
    })

    it('should accept 2-char PID for standard mode 09', () => {
      const pid = new PidCode('09', '02')
      expect(pid.key).toBe('09 02')
    })

    it('should throw PidCodeError for empty mode', () => {
      expect(() => new PidCode('', '0C')).toThrow(PidCodeError)
    })

    it('should throw PidCodeError for empty pid', () => {
      expect(() => new PidCode('01', '')).toThrow(PidCodeError)
    })

    it('should throw PidCodeError when mode is not exactly 2 hex digits', () => {
      expect(() => new PidCode('1', '0C')).toThrow(PidCodeError)
      expect(() => new PidCode('ABC', '0C')).toThrow(PidCodeError)
      expect(() => new PidCode('XX', '0C')).toThrow(PidCodeError)
    })

    it('should throw PidCodeError when pid is less than 2 hex digits', () => {
      expect(() => new PidCode('01', 'C')).toThrow(PidCodeError)
    })

    it('should throw PidCodeError when pid is more than 4 hex digits', () => {
      expect(() => new PidCode('01', '03000')).toThrow(PidCodeError)
    })

    it('should throw PidCodeError when pid contains non-hex chars', () => {
      expect(() => new PidCode('01', 'XX')).toThrow(PidCodeError)
      expect(() => new PidCode('01', '@G')).toThrow(PidCodeError)
    })

    it('should accept mode with letters A-F', () => {
      const pid = new PidCode('0A', '0C')
      expect(pid.mode).toBe('0A')
    })

    it('should accept the full hex range for PID', () => {
      const pid = new PidCode('22', 'ABCD')
      expect(pid.pid).toBe('ABCD')
    })
  })
})
