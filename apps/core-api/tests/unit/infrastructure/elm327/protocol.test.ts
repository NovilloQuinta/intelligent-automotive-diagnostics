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
  parseDtcResponseByEcu,
} from '@/infrastructure/elm327/protocol.js'
import {
  Elm327BusError,
  Elm327NoDataError,
  Elm327ParseError,
} from '@/infrastructure/elm327/errors.js'

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

    it('should throw Elm327BusError on "CAN ERROR" — el bus falla, no el parser', () => {
      expect(() => parseModeResponse('CAN ERROR')).toThrow(Elm327BusError)
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

    it('should throw Elm327BusError on "CAN ERROR" — el bus falla, no el parser', () => {
      expect(() => parseMode22Response('CAN ERROR', 2)).toThrow(Elm327BusError)
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

  describe('parseDtcResponseByEcu', () => {
    it('should group codes by the ECU that reports them', () => {
      const raw = '7E8 07 43 03 01 04 01 20 02\r7E9 04 43 01 33\r>'

      expect(parseDtcResponseByEcu(raw)).toEqual([
        {
          ecuAddress: '7E8',
          pairs: [
            [0x03, 0x01],
            [0x04, 0x01],
            [0x20, 0x02],
          ],
        },
        { ecuAddress: '7E9', pairs: [[0x01, 0x33]] },
      ])
    })

    it('should return a single group when only one ECU answers', () => {
      const raw = '7E8 07 43 03 01 04 01 20 02\r\r>'

      expect(parseDtcResponseByEcu(raw)).toEqual([
        {
          ecuAddress: '7E8',
          pairs: [
            [0x03, 0x01],
            [0x04, 0x01],
            [0x20, 0x02],
          ],
        },
      ])
    })

    it('should keep the codes without an ECU when headers are off', () => {
      // Sin `AT H1` la respuesta no dice quien contesta. Los codigos siguen siendo
      // validos: el origen es opcional, no un requisito.
      const raw = '43 03 01 04 01\r\r>'

      expect(parseDtcResponseByEcu(raw)).toEqual([
        {
          ecuAddress: undefined,
          pairs: [
            [0x03, 0x01],
            [0x04, 0x01],
          ],
        },
      ])
    })

    it('should ignore addresses that are not diagnostic responses', () => {
      const raw = '7E8 07 43 03 01\r18DB33F1 04 43 01 33\r>'

      expect(parseDtcResponseByEcu(raw)).toEqual([{ ecuAddress: '7E8', pairs: [[0x03, 0x01]] }])
    })

    it('should group 29-bit responders by their own address', () => {
      const raw = '18DAF110 07 43 03 01\r18DAF111 04 43 01 33\r>'

      expect(parseDtcResponseByEcu(raw)).toEqual([
        { ecuAddress: '18DAF110', pairs: [[0x03, 0x01]] },
        { ecuAddress: '18DAF111', pairs: [[0x01, 0x33]] },
      ])
    })

    it('should return [] for NO DATA', () => {
      expect(parseDtcResponseByEcu('NO DATA\r\r>')).toEqual([])
    })

    it('should honour the mode byte of pending (07) and permanent (0A) reads', () => {
      expect(parseDtcResponseByEcu('7E8 04 47 01 33\r>', '07')).toEqual([
        { ecuAddress: '7E8', pairs: [[0x01, 0x33]] },
      ])
      expect(parseDtcResponseByEcu('7E8 04 4A 01 33\r>', '0A')).toEqual([
        { ecuAddress: '7E8', pairs: [[0x01, 0x33]] },
      ])
    })

    it('should throw when no line carries the mode byte', () => {
      expect(() => parseDtcResponseByEcu('7E8 04 41 00 BE\r>')).toThrow(Elm327ParseError)
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

    it('should throw Elm327BusError on "CAN ERROR" — el bus falla, no el parser', () => {
      expect(() => parseDtcResponse('CAN ERROR')).toThrow(Elm327BusError)
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

    it('should accept 29-bit CAN headers addressed to the tester', () => {
      expect(parseCanHeaders('18DAF110 06 41 00 BE 3F A8 13\r>')).toEqual(['18DAF110'])
    })

    it('should accept several 29-bit responders preserving order', () => {
      const raw = '18DAF110 06 41 00 BE 3F A8 13\r18DAF111 06 41 00 80 00 00 00\r>'
      expect(parseCanHeaders(raw)).toEqual(['18DAF110', '18DAF111'])
    })

    it('should dedupe repeated 29-bit headers', () => {
      const raw = '18DAF110 10 14 49 02 01\r18DAF110 21 57 41 55 5A\r>'
      expect(parseCanHeaders(raw)).toEqual(['18DAF110'])
    })

    it('should discard 29-bit headers not addressed to the tester', () => {
      // `18DB33F1` es la peticion funcional y `18DA10F1` la fisica: van hacia la
      // ECU, no hacia el equipo de diagnostico. Solo `18DAF1xx` es una respuesta.
      const raw = '18DB33F1 06 41 00 00 00 00 00\r18DA10F1 06 41 00 00 00 00 00\r>'
      expect(parseCanHeaders(raw)).toEqual([])
    })

    it('should discard 29-bit headers that are not ISO 15765-4 diagnostics at all', () => {
      expect(parseCanHeaders('18FEE000 06 41 00 00 00 00 00\r>')).toEqual([])
    })

    it('should discard empty lines and the ">" prompt', () => {
      expect(parseCanHeaders('\r\r>\r7E8 06 41 00 BE 3F A8 13\r\r>')).toEqual(['7E8'])
    })

    it('should accept the ISO 15765-4 response range 7E8-7EF', () => {
      const raw = '7E8 06 41 00 BE 3F A8 13\r7E9 06 41 00 80 00 00 00\r7EF 06 41 00 00 00 00 00\r>'
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

  describe('bus errors', () => {
    it.each([
      ['UNABLE TO CONNECT', /contacto/i],
      ['BUS INIT: ...ERROR', /bus/i],
      ['CAN ERROR', /CAN/i],
      ['BUS BUSY', /ocupado/i],
      ['DATA ERROR', /datos/i],
      ['BUFFER FULL', /desbord/i],
      ['STOPPED', /interrump/i],
      ['LV RESET', /tensi/i],
    ])('should translate "%s" into an actionable Elm327BusError', (response, expected) => {
      expect(() => parseModeResponse(`01 0C\r${response}\r\r>`)).toThrow(Elm327BusError)
      expect(() => parseModeResponse(`01 0C\r${response}\r\r>`)).toThrow(expected)
    })

    it('should classify a bus error as external so the caller may retry', () => {
      expect(new Elm327BusError('UNABLE TO CONNECT', 'raw').errorCategory).toBe('external_error')
    })

    it('should keep the raw response in the message for debugging', () => {
      const raw = '01 0C\rCAN ERROR\r\r>'
      expect(() => parseModeResponse(raw)).toThrow(/CAN ERROR/)
    })

    it('should throw on a bus error in DTC reads instead of reporting "no faults"', () => {
      expect(() => parseDtcResponse('03\rUNABLE TO CONNECT\r\r>', '03')).toThrow(Elm327BusError)
    })

    it('should throw on a bus error in Mode 22 reads', () => {
      expect(() => parseMode22Response('22 11 30\rBUS BUSY\r\r>', 2)).toThrow(Elm327BusError)
    })

    it('should throw on a bus error in VIN reads', () => {
      expect(() => parseVinResponse('09 02\rSTOPPED\r\r>')).toThrow(Elm327BusError)
    })

    it('should throw on a bus error in multi-PID reads instead of skipping the line', () => {
      expect(() => parseModeResponseEntries('0: CAN ERROR\r\r>')).toThrow(Elm327BusError)
    })

    it('should not confuse "NO DATA" with a bus error — it means the PID is unsupported', () => {
      expect(() => parseModeResponse('01 0C\rNO DATA\r\r>')).toThrow(Elm327NoDataError)
    })

    it('should not flag a healthy response that happens to contain matching bytes', () => {
      expect(parseModeResponse('01 0C\r41 0C 0C 80\r\r>')).toEqual([0x0c, 0x80])
    })
  })
})
