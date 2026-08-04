import { describe, it, expect } from 'vitest'
import {
  FrameType,
  parsePci,
  buildPci,
  IsotpFrameError,
} from '@/infrastructure/elm327/isotp/frameTypes.js'

describe('parsePci', () => {
  describe('Single Frame (PCI 0x0n)', () => {
    it('0x03 → { type: SINGLE, dataLength: 3 }', () => {
      const result = parsePci(0x03)
      expect(result.type).toBe(FrameType.SINGLE)
      expect(result.dataLength).toBe(3)
    })

    it('0x07 → { type: SINGLE, dataLength: 7 }', () => {
      const result = parsePci(0x07)
      expect(result.type).toBe(FrameType.SINGLE)
      expect(result.dataLength).toBe(7)
    })

    it('0x01 → { type: SINGLE, dataLength: 1 } (minimo)', () => {
      const result = parsePci(0x01)
      expect(result.type).toBe(FrameType.SINGLE)
      expect(result.dataLength).toBe(1)
    })

    it('0x00 → lanza IsotpFrameError (SF dataLength=0 invalido)', () => {
      expect(() => parsePci(0x00)).toThrow(IsotpFrameError)
    })
  })

  describe('First Frame (PCI 0x1n)', () => {
    it('0x10 → { type: FIRST }', () => {
      const result = parsePci(0x10)
      expect(result.type).toBe(FrameType.FIRST)
      expect(result.dataLength).toBeUndefined()
    })

    it('0x1F → { type: FIRST } (upper nibble de 12-bit length)', () => {
      const result = parsePci(0x1f)
      expect(result.type).toBe(FrameType.FIRST)
      expect(result.dataLength).toBeUndefined()
    })
  })

  describe('Consecutive Frame (PCI 0x2n)', () => {
    it('0x21 → { type: CONSECUTIVE, sequenceNumber: 1 }', () => {
      const result = parsePci(0x21)
      expect(result.type).toBe(FrameType.CONSECUTIVE)
      expect(result.sequenceNumber).toBe(1)
    })

    it('0x2F → { type: CONSECUTIVE, sequenceNumber: 15 }', () => {
      const result = parsePci(0x2f)
      expect(result.type).toBe(FrameType.CONSECUTIVE)
      expect(result.sequenceNumber).toBe(15)
    })

    it('0x20 → { type: CONSECUTIVE, sequenceNumber: 0 }', () => {
      const result = parsePci(0x20)
      expect(result.type).toBe(FrameType.CONSECUTIVE)
      expect(result.sequenceNumber).toBe(0)
    })
  })

  describe('Flow Control (PCI 0x3n)', () => {
    it('0x30 → { type: FLOW_CONTROL, flowStatus: 0 } (CTS)', () => {
      const result = parsePci(0x30)
      expect(result.type).toBe(FrameType.FLOW_CONTROL)
      expect(result.flowStatus).toBe(0)
    })

    it('0x32 → { type: FLOW_CONTROL, flowStatus: 2 } (overflow)', () => {
      const result = parsePci(0x32)
      expect(result.type).toBe(FrameType.FLOW_CONTROL)
      expect(result.flowStatus).toBe(2)
    })

    it('0x31 → { type: FLOW_CONTROL, flowStatus: 1 } (wait)', () => {
      const result = parsePci(0x31)
      expect(result.type).toBe(FrameType.FLOW_CONTROL)
      expect(result.flowStatus).toBe(1)
    })
  })

  describe('PCI byte invalido', () => {
    it('0x40 → lanza IsotpFrameError', () => {
      expect(() => parsePci(0x40)).toThrow(IsotpFrameError)
    })

    it('0xFF → lanza IsotpFrameError', () => {
      expect(() => parsePci(0xff)).toThrow(IsotpFrameError)
    })
  })
})

describe('buildPci', () => {
  describe('Single Frame', () => {
    it('dataLength=3 → 0x03', () => {
      expect(buildPci({ type: FrameType.SINGLE, dataLength: 3 })).toBe(0x03)
    })

    it('dataLength=7 → 0x07', () => {
      expect(buildPci({ type: FrameType.SINGLE, dataLength: 7 })).toBe(0x07)
    })

    it('dataLength=1 → 0x01', () => {
      expect(buildPci({ type: FrameType.SINGLE, dataLength: 1 })).toBe(0x01)
    })
  })

  describe('First Frame', () => {
    it('type=1 → 0x10', () => {
      expect(buildPci({ type: FrameType.FIRST })).toBe(0x10)
    })

    it('FIRST con totalLength=19 → 0x10 (upper nibble 0)', () => {
      expect(buildPci({ type: FrameType.FIRST, dataLength: 19 })).toBe(0x10)
    })

    it('FIRST con totalLength=4095 → 0x1f (upper nibble 0xf)', () => {
      expect(buildPci({ type: FrameType.FIRST, dataLength: 4095 })).toBe(0x1f)
    })
  })

  describe('Consecutive Frame', () => {
    it('sequenceNumber=1 → 0x21', () => {
      expect(buildPci({ type: FrameType.CONSECUTIVE, sequenceNumber: 1 })).toBe(0x21)
    })

    it('sequenceNumber=5 → 0x25', () => {
      expect(buildPci({ type: FrameType.CONSECUTIVE, sequenceNumber: 5 })).toBe(0x25)
    })

    it('sequenceNumber=0 → 0x20', () => {
      expect(buildPci({ type: FrameType.CONSECUTIVE, sequenceNumber: 0 })).toBe(0x20)
    })
  })

  describe('Flow Control', () => {
    it('flowStatus=0 → 0x30 (CTS)', () => {
      expect(buildPci({ type: FrameType.FLOW_CONTROL, flowStatus: 0 })).toBe(0x30)
    })

    it('flowStatus=2 → 0x32 (overflow)', () => {
      expect(buildPci({ type: FrameType.FLOW_CONTROL, flowStatus: 2 })).toBe(0x32)
    })

    it('SINGLE sin dataLength → 0x00', () => {
      expect(buildPci({ type: FrameType.SINGLE })).toBe(0x00)
    })

    it('CONSECUTIVE sin sequenceNumber → 0x20', () => {
      expect(buildPci({ type: FrameType.CONSECUTIVE })).toBe(0x20)
    })

    it('FLOW_CONTROL sin flowStatus → 0x30', () => {
      expect(buildPci({ type: FrameType.FLOW_CONTROL })).toBe(0x30)
    })
  })
})

describe('FrameType enum', () => {
  it('should have correct values', () => {
    expect(FrameType.SINGLE).toBe(0)
    expect(FrameType.FIRST).toBe(1)
    expect(FrameType.CONSECUTIVE).toBe(2)
    expect(FrameType.FLOW_CONTROL).toBe(3)
  })
})
