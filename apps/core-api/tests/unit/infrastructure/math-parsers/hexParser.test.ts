import { describe, it, expect } from 'vitest'
import {
  parseRpm,
  parseCoolantTemp,
  parseSpeed,
  parseIntakeTemp,
  parseAllPids,
  ParseError,
} from '@/infrastructure/math-parsers/hexParser.js'

describe('parseRpm', () => {
  it('should parse a normal RPM value', () => {
    expect(parseRpm('1AF8')).toBe(1726)
  })

  it('should parse idle RPM', () => {
    expect(parseRpm('03E8')).toBe(250)
  })

  it('should parse zero RPM', () => {
    expect(parseRpm('0000')).toBe(0)
  })

  it('should throw when hex string is too short', () => {
    expect(() => parseRpm('1AF')).toThrow(ParseError)
  })

  it('should throw when hex string is empty', () => {
    expect(() => parseRpm('')).toThrow(ParseError)
  })

  it('should throw when hex string contains invalid characters', () => {
    expect(() => parseRpm('1AFG')).toThrow(ParseError)
  })
})

describe('parseCoolantTemp', () => {
  it('should parse normal coolant temperature', () => {
    expect(parseCoolantTemp('5A')).toBe(50)
  })

  it('should parse cold coolant temperature', () => {
    expect(parseCoolantTemp('23')).toBe(-5)
  })

  it('should parse minimum temperature', () => {
    expect(parseCoolantTemp('00')).toBe(-40)
  })

  it('should throw when hex string is too short', () => {
    expect(() => parseCoolantTemp('5')).toThrow(ParseError)
  })

  it('should throw when hex string is empty', () => {
    expect(() => parseCoolantTemp('')).toThrow(ParseError)
  })
})

describe('parseSpeed', () => {
  it('should parse normal speed', () => {
    expect(parseSpeed('64')).toBe(100)
  })

  it('should parse zero speed', () => {
    expect(parseSpeed('00')).toBe(0)
  })

  it('should parse maximum speed', () => {
    expect(parseSpeed('FF')).toBe(255)
  })

  it('should throw when hex string is too short', () => {
    expect(() => parseSpeed('6')).toThrow(ParseError)
  })

  it('should throw when hex string is empty', () => {
    expect(() => parseSpeed('')).toThrow(ParseError)
  })
})

describe('parseIntakeTemp', () => {
  it('should parse normal intake air temperature', () => {
    expect(parseIntakeTemp('4B')).toBe(35)
  })

  it('should parse cold intake air temperature', () => {
    expect(parseIntakeTemp('23')).toBe(-5)
  })

  it('should throw when hex string is too short', () => {
    expect(() => parseIntakeTemp('4')).toThrow(ParseError)
  })
})

describe('parseAllPids', () => {
  it('should parse a complete 5-byte frame', () => {
    const result = parseAllPids('1AF85A644B')
    expect(result).toEqual({
      rpm: 1726,
      coolantTemp: 50,
      speed: 100,
      intakeTemp: 35,
    })
  })

  it('should handle lowercase hex input', () => {
    const result = parseAllPids('1af85a644b')
    expect(result).toEqual({
      rpm: 1726,
      coolantTemp: 50,
      speed: 100,
      intakeTemp: 35,
    })
  })

  it('should throw when frame is empty', () => {
    expect(() => parseAllPids('')).toThrow(ParseError)
  })

  it('should throw when frame is incomplete', () => {
    expect(() => parseAllPids('1AF85A')).toThrow(ParseError)
  })

  it('should throw when frame has wrong length', () => {
    expect(() => parseAllPids('1AF85A644BFF')).toThrow(ParseError)
  })
})
