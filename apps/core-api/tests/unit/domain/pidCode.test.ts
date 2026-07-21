import { describe, it, expect } from 'vitest'
import { PidCode } from '@/domain/pidCode.js'

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

    it('should accept 2-char standard mode', () => {
      const pid = PidCode.create('22', '0300')
      expect(pid.key).toBe('22 0300')
    })

    it('should accept 4-char extended PID', () => {
      const pid = PidCode.create('01', '0300')
      expect(pid.pid).toBe('0300')
    })

    it('should throw when mode is not exactly 2 hex digits', () => {
      expect(() => PidCode.create('1', '0C')).toThrow('Invalid OBD mode')
      expect(() => PidCode.create('ABC', '0C')).toThrow('Invalid OBD mode')
      expect(() => PidCode.create('XX', '0C')).toThrow('Invalid OBD mode')
    })

    it('should throw when pid is less than 2 hex digits', () => {
      expect(() => PidCode.create('01', 'C')).toThrow('Invalid PID code')
    })

    it('should throw when pid is more than 4 hex digits', () => {
      expect(() => PidCode.create('01', '03000')).toThrow('Invalid PID code')
    })

    it('should throw when pid contains non-hex chars', () => {
      expect(() => PidCode.create('01', 'XX')).toThrow('Invalid PID code')
    })
  })

  describe('PidCode.fromTrusted', () => {
    it('should create a PidCode without validation', () => {
      const pid = PidCode.fromTrusted('01', '0C')
      expect(pid.mode).toBe('01')
      expect(pid.pid).toBe('0C')
    })

    it('should not validate input', () => {
      const pid = PidCode.fromTrusted('XX', 'ZZ')
      expect(pid.mode).toBe('XX')
    })
  })
})
