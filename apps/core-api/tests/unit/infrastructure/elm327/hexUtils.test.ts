import { describe, it, expect } from 'vitest'
import { parseHexBytes } from '@/infrastructure/elm327/hexUtils.js'
import { Elm327ParseError } from '@/infrastructure/elm327/errors.js'

describe('hexUtils', () => {
  describe('parseHexBytes', () => {
    it('should parse simple hex string to byte array', () => {
      expect(parseHexBytes('0C 80')).toEqual([0x0c, 0x80])
    })

    it('should handle extra spaces', () => {
      expect(parseHexBytes('0C   80 ')).toEqual([0x0c, 0x80])
    })

    it('should return empty array for empty string', () => {
      expect(parseHexBytes('')).toEqual([])
    })

    it('should parse single byte', () => {
      expect(parseHexBytes('0C')).toEqual([0x0c])
    })

    it('should parse lowercase hex', () => {
      expect(parseHexBytes('0c 80')).toEqual([0x0c, 0x80])
    })

    it('should throw Elm327ParseError for invalid hex token "GG"', () => {
      expect(() => parseHexBytes('GG')).toThrow(Elm327ParseError)
    })

    it('should throw Elm327ParseError for token longer than 2 chars', () => {
      expect(() => parseHexBytes('1FF')).toThrow(Elm327ParseError)
    })
  })
})
