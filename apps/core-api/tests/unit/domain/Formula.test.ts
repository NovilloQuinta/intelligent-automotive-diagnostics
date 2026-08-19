import { describe, it, expect } from 'vitest'
import { Formula } from '@/domain/value-objects/Formula.js'

describe('Formula', () => {
  describe('create', () => {
    it('should create a Formula from a valid expression', () => {
      const formula = new Formula('A-40')
      expect(formula).toBeInstanceOf(Formula)
      expect(formula.expression).toBe('A-40')
    })

    it('should throw on empty expression', () => {
      expect(() => new Formula('')).toThrow()
    })

    it('should throw on whitespace-only expression', () => {
      expect(() => new Formula('   ')).toThrow()
    })

    it('should throw on invalid character in expression', () => {
      expect(() => new Formula('A$5')).toThrow()
    })

    it('should throw on unknown variable', () => {
      expect(() => new Formula('Z+1')).toThrow()
    })

    it('should throw on missing closing parenthesis', () => {
      expect(() => new Formula('(A*2')).toThrow()
    })

    it('should throw on extra closing parenthesis', () => {
      expect(() => new Formula('A)')).toThrow()
    })

    it('should accept expression with bitwise operators', () => {
      const formula = new Formula('A<<8|B')
      expect(formula.expression).toBe('A<<8|B')
    })
  })

  describe('evaluate', () => {
    it('should evaluate simple arithmetic: A-40', () => {
      const formula = new Formula('A-40')
      expect(formula.evaluate([0x5a])).toBe(50)
    })

    it('should evaluate RPM formula: (A*256+B)/4', () => {
      const formula = new Formula('(A*256+B)/4')
      expect(formula.evaluate([0x0c, 0x80])).toBe(800)
    })

    it('should evaluate bitwise OR with shift: A<<24|B<<16|C<<8|D', () => {
      const formula = new Formula('(A<<24|B<<16|C<<8|D)/10')
      expect(formula.evaluate([0x00, 0x01, 0x86, 0xa0])).toBeCloseTo(10000)
    })

    it('should evaluate with raw variable', () => {
      const formula = new Formula('raw/10')
      expect(formula.evaluate([0x00, 0x03, 0x0c])).toBe(78)
    })

    it('should evaluate negative result', () => {
      const formula = new Formula('A-40')
      expect(formula.evaluate([0x00])).toBe(-40)
    })

    it('should throw on division by zero at evaluation time', () => {
      const formula = new Formula('A/0')
      expect(() => formula.evaluate([0x05])).toThrow()
    })

    it('should throw when variable index exceeds bytes length', () => {
      const formula = new Formula('C*2')
      expect(() => formula.evaluate([0x00])).toThrow()
    })
  })

  describe('expression immutability', () => {
    it('should return readonly expression', () => {
      const formula = new Formula('A-40')
      expect(formula.expression).toBe('A-40')
    })
  })
})
