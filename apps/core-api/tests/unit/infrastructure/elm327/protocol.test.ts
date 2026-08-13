import { describe, it, expect } from 'vitest'
import {
  formatCommand,
  stripEcho,
  parseModeResponse,
  parseModeResponseEntries,
  parseMode22Response,
  parseVinResponse,
  parseDtcResponse,
  parseSupportedPidBitmask,
  parseHexBytes,
  parseCanHeaders,
} from '@/infrastructure/elm327/protocol.js'
import { Elm327NoDataError, Elm327ParseError } from '@/infrastructure/elm327/errors.js'

describe('protocol', () => {
  describe('formatCommand', () => {
    it('should format Mode 22 PID "1130" → "22 11 30"', () => {
      expect(formatCommand('22', '1130')).toBe('22 11 30')
    })

    it('should format Mode 01 PID "0c" → "01 0C" (uppercase)', () => {
      expect(formatCommand('01', '0c')).toBe('01 0C')
    })

    it('should strip spaces and format "0 C" → "01 0C"', () => {
      expect(formatCommand('01', '0 C')).toBe('01 0C')
    })
  })

  describe('stripEcho', () => {
    it('should strip echo, prompt, and empty lines leaving only data', () => {
      const raw = '01 0C\r41 0C 0C 80 \r\r>'
      expect(stripEcho(raw)).toBe('41 0C 0C 80')
    })

    it('should strip lines starting with AT', () => {
      expect(stripEcho('AT Z\r\r41 0C 0C 80\r\r>')).toBe('41 0C 0C 80')
    })

    it('should strip standalone "OK" line', () => {
      expect(stripEcho('OK\r\r41 0C 0C 80\r\r>')).toBe('41 0C 0C 80')
    })
  })

  describe('parseModeResponse', () => {
    it('should parse "41 0C 0C 80" → [0x0C, 0x80]', () => {
      expect(parseModeResponse('41 0C 0C 80')).toEqual([0x0c, 0x80])
    })

    it('should parse "41 05 82" → [0x82]', () => {
      expect(parseModeResponse('41 05 82')).toEqual([0x82])
    })

    it('should throw Elm327NoDataError on "NO DATA"', () => {
      expect(() => parseModeResponse('NO DATA')).toThrow(Elm327NoDataError)
    })

    it('should throw Elm327ParseError on "CAN ERROR"', () => {
      expect(() => parseModeResponse('CAN ERROR')).toThrow(Elm327ParseError)
    })

    it('should throw Elm327ParseError on invalid input', () => {
      expect(() => parseModeResponse('ZZ ZZ ZZ')).toThrow(Elm327ParseError)
    })

    it('should NOT treat 0x7F data byte as negative response code', () => {
      // PID 01 byte B = 0x7F es un valor legitimo (SAE J1979: compression + all common tests)
      expect(() => parseModeResponse('41 01 83 7F FF FF')).not.toThrow()
    })

    it('should throw Elm327ParseError on genuine negative response 7F at start', () => {
      expect(() => parseModeResponse('7F 01 11')).toThrow(Elm327ParseError)
    })

    it('should parse multi-frame "0: 41 0C 0C 80\\n1: 41 0D 5A\\n>" → [0x0C, 0x80, 0x5A]', () => {
      expect(parseModeResponse('0: 41 0C 0C 80\n1: 41 0D 5A\n>')).toEqual([0x0c, 0x80, 0x5a])
    })

    it('should parse multi-PID "0: 41 0C 0C 80\\r\\n1: 41 0D 5A\\r\\n2: 41 05 50\\r\\n>" → [0x0C, 0x80, 0x5A, 0x50]', () => {
      expect(parseModeResponse('0: 41 0C 0C 80\r\n1: 41 0D 5A\r\n2: 41 05 50\r\n>')).toEqual([
        0x0c, 0x80, 0x5a, 0x50,
      ])
    })

    it('should keep single-line "41 0C 0C 80>" → [0x0C, 0x80]', () => {
      expect(parseModeResponse('41 0C 0C 80>')).toEqual([0x0c, 0x80])
    })

    it('should throw Elm327NoDataError when a multi-frame line is "NO DATA"', () => {
      expect(() => parseModeResponse('0: 41 0C 0C 80\n1: NO DATA\n>')).toThrow(Elm327NoDataError)
    })
  })

  describe('parseModeResponseEntries', () => {
    it('should map each "N: 4X YY <data>" line to { pid, bytes }', () => {
      expect(parseModeResponseEntries('0: 41 0C 0C 80\n1: 41 0D 5A\n>')).toEqual([
        { pid: '0C', bytes: [0x0c, 0x80] },
        { pid: '0D', bytes: [0x5a] },
      ])
    })

    it('should omit "NO DATA" lines (per-PID degradation)', () => {
      expect(parseModeResponseEntries('0: 41 0C 0C 80\n1: NO DATA\n>')).toEqual([
        { pid: '0C', bytes: [0x0c, 0x80] },
      ])
    })

    it('should uppercase the PID code', () => {
      expect(parseModeResponseEntries('0: 41 0c 0c 80\n>')).toEqual([
        { pid: '0C', bytes: [0x0c, 0x80] },
      ])
    })
  })

  describe('parseMode22Response', () => {
    it('should parse "62 11 30 0C 80" → [0x0C, 0x80]', () => {
      expect(parseMode22Response('62 11 30 0C 80', 0)).toEqual([0x0c, 0x80])
    })

    it('should slice to didLen=2 → [0x0C, 0x80]', () => {
      expect(parseMode22Response('62 11 30 0C 80 5A', 2)).toEqual([0x0c, 0x80])
    })

    it('should throw Elm327NoDataError on "NO DATA"', () => {
      expect(() => parseMode22Response('NO DATA', 2)).toThrow(Elm327NoDataError)
    })

    it('should throw Elm327ParseError on "CAN ERROR"', () => {
      expect(() => parseMode22Response('CAN ERROR', 2)).toThrow(Elm327ParseError)
    })
  })

  describe('parseVinResponse', () => {
    it('should parse multi-line Porsche VIN → 17 ASCII bytes after stripping 49 02 01 prefix', () => {
      const raw =
        '09 02\r0: 49 02 01 57 50 30\n1: 5A 5A 5A 39 39 5A\n2: 54 53 33 39 30 30\n3: 30 30'
      const bytes = parseVinResponse(raw)
      // "WP0ZZZ99ZTS390000" = W(0x57) P(0x50) 0(0x30) ...
      expect(bytes).toEqual([
        0x57, 0x50, 0x30, 0x5a, 0x5a, 0x5a, 0x39, 0x39, 0x5a, 0x54, 0x53, 0x33, 0x39, 0x30, 0x30,
        0x30, 0x30,
      ])
      expect(bytes.length).toBe(17)
    })

    it('should parse single-line Audi VIN → 17 ASCII bytes after stripping 49 02 01 prefix', () => {
      const raw = '09 02\r49 02 01 57 41 55 5A 5A 5A 38 56 35 4A 41 31 32 33 34 35 36 \r\r>'
      const bytes = parseVinResponse(raw)
      // WAUZZZ8V5JA123456
      expect(bytes).toEqual([
        0x57, 0x41, 0x55, 0x5a, 0x5a, 0x5a, 0x38, 0x56, 0x35, 0x4a, 0x41, 0x31, 0x32, 0x33, 0x34,
        0x35, 0x36,
      ])
      expect(bytes.length).toBe(17)
    })

    it('should throw Elm327NoDataError on "NO DATA"', () => {
      expect(() => parseVinResponse('NO DATA')).toThrow(Elm327NoDataError)
    })
  })

  describe('parseDtcResponse', () => {
    it('should parse "43 03 01 04 01" → [[0x03,0x01],[0x04,0x01]] (default Mode 03)', () => {
      expect(parseDtcResponse('43 03 01 04 01')).toEqual([
        [0x03, 0x01],
        [0x04, 0x01],
      ])
    })

    it('should parse "47 03 01 04 01" → [[0x03,0x01],[0x04,0x01]] (Mode 07, header 47)', () => {
      expect(parseDtcResponse('47 03 01 04 01', '07')).toEqual([
        [0x03, 0x01],
        [0x04, 0x01],
      ])
    })

    it('should parse "4A 03 01 04 01" → [[0x03,0x01],[0x04,0x01]] (Mode 0A, header 4A)', () => {
      expect(parseDtcResponse('4A 03 01 04 01', '0A')).toEqual([
        [0x03, 0x01],
        [0x04, 0x01],
      ])
    })

    it('should return empty array on "NO DATA"', () => {
      expect(parseDtcResponse('NO DATA')).toEqual([])
    })

    it('should throw Elm327ParseError on "CAN ERROR"', () => {
      expect(() => parseDtcResponse('CAN ERROR')).toThrow(Elm327ParseError)
    })

    it('should throw Elm327ParseError when header does not match mode (Mode 03 with 47 header)', () => {
      expect(() => parseDtcResponse('47 03 01 04 01', '03')).toThrow(Elm327ParseError)
    })
  })

  describe('parseSupportedPidBitmask', () => {
    it('should parse [0xB8, 0x3B, 0xA8, 0x13] → 15 supported PIDs', () => {
      const result = parseSupportedPidBitmask([0xb8, 0x3b, 0xa8, 0x13])
      expect(result).toEqual([
        '01 01',
        '01 03',
        '01 04',
        '01 05',
        '01 0B',
        '01 0C',
        '01 0D',
        '01 0F',
        '01 10',
        '01 11',
        '01 13',
        '01 15',
        '01 1C',
        '01 1F',
        '01 20',
      ])
    })

    it('should return empty list for all-zero bitmask', () => {
      expect(parseSupportedPidBitmask([0x00, 0x00])).toEqual([])
    })
  })

  describe('parseCanHeaders', () => {
    it('should dedupe multi-ECU headers preserving order of appearance', () => {
      const raw = '7E8 06 41 00 BE 3F A8 13\r7E9 06 41 00 80 00 00 00\r7E8 28 41 00 00 00 00 00\r>'
      expect(parseCanHeaders(raw)).toEqual(['7E8', '7E9'])
    })

    it('should return [] for a single-ECU response without AT H1 headers', () => {
      expect(parseCanHeaders('41 00 BE 3F A8 13\r>')).toEqual([])
    })

    it('should ignore 29-bit CAN headers (extended addressing)', () => {
      expect(parseCanHeaders('18DAF110 06 41 00 BE 3F A8 13\r>')).toEqual([])
    })

    it('should discard empty lines and the ">" prompt', () => {
      expect(parseCanHeaders('\r\r>\r7E8 06 41 00 BE 3F A8 13\r\r>')).toEqual(['7E8'])
    })

    it('should accept the ISO 15765-4 response range 7E8-7EF', () => {
      const raw =
        '7E8 06 41 00 BE 3F A8 13\r7E9 06 41 00 80 00 00 00\r7EF 06 41 00 00 00 00 00\r>'
      expect(parseCanHeaders(raw)).toEqual(['7E8', '7E9', '7EF'])
    })

    it('should accept lower boundary 7E8 and discard 7E7', () => {
      expect(parseCanHeaders('7E7 06 41 00 00 00 00 00\r7E8 06 41 00 BE 3F A8 13\r>')).toEqual([
        '7E8',
      ])
    })

    it('should accept upper boundary 7EF and discard 7F0', () => {
      expect(parseCanHeaders('7EF 06 41 00 00 00 00 00\r7F0 06 41 00 BE 3F A8 13\r>')).toEqual([
        '7EF',
      ])
    })

    it('should discard 11-bit headers outside the 7E8-7EF range (e.g. 7DA, 768, 800)', () => {
      const raw =
        '7DA 06 41 00 00 00 00 00\r768 06 41 00 00 00 00 00\r800 06 41 00 00 00 00 00\r7E8 06 41 00 BE 3F A8 13\r>'
      expect(parseCanHeaders(raw)).toEqual(['7E8'])
    })

    it('should discard NO DATA / CAN ERROR lines', () => {
      expect(parseCanHeaders('NO DATA\rCAN ERROR\r7E8 06 41 00 BE 3F A8 13\r>')).toEqual(['7E8'])
    })
  })

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
