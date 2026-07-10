import { describe, it, expect } from 'vitest'
import {
  parseRpm,
  parseCoolantTemp,
  parseSpeed,
  parseIntakeTemp,
  parseAllPids,
  ParseError,
} from './hexParser.js'

describe('parseRpm', () => {
  it('parses a normal RPM value', () => {
    expect(parseRpm('1AF8')).toBe(1726)
  })

  it('parses idle RPM', () => {
    expect(parseRpm('03E8')).toBe(250)
  })

  it('parses zero RPM', () => {
    expect(parseRpm('0000')).toBe(0)
  })

  it('throws on short hex string', () => {
    expect(() => parseRpm('1AF')).toThrow(ParseError)
  })

  it('throws on empty hex string', () => {
    expect(() => parseRpm('')).toThrow(ParseError)
  })

  it('throws on invalid hex characters', () => {
    expect(() => parseRpm('1AFG')).toThrow(ParseError)
  })
})

describe('parseCoolantTemp', () => {
  it('parses normal coolant temperature', () => {
    expect(parseCoolantTemp('5A')).toBe(50)
  })

  it('parses cold coolant temperature', () => {
    expect(parseCoolantTemp('23')).toBe(-5)
  })

  it('parses minimum temperature', () => {
    expect(parseCoolantTemp('00')).toBe(-40)
  })

  it('throws on short hex string', () => {
    expect(() => parseCoolantTemp('5')).toThrow(ParseError)
  })

  it('throws on empty hex string', () => {
    expect(() => parseCoolantTemp('')).toThrow(ParseError)
  })
})

describe('parseSpeed', () => {
  it('parses normal speed', () => {
    expect(parseSpeed('64')).toBe(100)
  })

  it('parses zero speed', () => {
    expect(parseSpeed('00')).toBe(0)
  })

  it('parses maximum speed', () => {
    expect(parseSpeed('FF')).toBe(255)
  })

  it('throws on short hex string', () => {
    expect(() => parseSpeed('6')).toThrow(ParseError)
  })

  it('throws on empty hex string', () => {
    expect(() => parseSpeed('')).toThrow(ParseError)
  })
})

describe('parseIntakeTemp', () => {
  it('parses normal intake air temperature', () => {
    expect(parseIntakeTemp('4B')).toBe(35)
  })

  it('parses cold intake air temperature', () => {
    expect(parseIntakeTemp('23')).toBe(-5)
  })

  it('throws on short hex string', () => {
    expect(() => parseIntakeTemp('4')).toThrow(ParseError)
  })
})

describe('parseAllPids', () => {
  it('parses a complete 5-byte frame', () => {
    const result = parseAllPids('1AF85A644B')
    expect(result).toEqual({
      rpm: 1726,
      coolantTemp: 50,
      speed: 100,
      intakeTemp: 35,
    })
  })

  it('handles lowercase hex input', () => {
    const result = parseAllPids('1af85a644b')
    expect(result).toEqual({
      rpm: 1726,
      coolantTemp: 50,
      speed: 100,
      intakeTemp: 35,
    })
  })

  it('throws on empty frame', () => {
    expect(() => parseAllPids('')).toThrow(ParseError)
  })

  it('throws on incomplete frame', () => {
    expect(() => parseAllPids('1AF85A')).toThrow(ParseError)
  })

  it('throws on frame with wrong length', () => {
    expect(() => parseAllPids('1AF85A644BFF')).toThrow(ParseError)
  })
})
