import { describe, it, expect } from 'vitest'
import {
  segmentPayload,
  computeFrameCount,
  IsotpOverflowError,
} from '@/infrastructure/obd/isotp/segmenter.js'
import { FrameType, parsePci } from '@/infrastructure/obd/isotp/frameTypes.js'
import { reassembleFrames } from '@/infrastructure/obd/isotp/reassembler.js'

function payloadBytes(count: number, offset = 0): number[] {
  return Array.from({ length: count }, (_, i) => (i + offset) % 256)
}

function getPci(frame: CanFrame): number {
  return frame.data[0]
}

describe('segmentPayload', () => {
  describe('Single Frame', () => {
    it('payload de 3 bytes → 1 SF con PCI 0x03', () => {
      const payload = [0x09, 0x02, 0x01]
      const result = segmentPayload(payload)
      expect(result).toHaveLength(1)
      expect(getPci(result[0])).toBe(0x03)
      expect(result[0].data).toEqual([0x03, 0x09, 0x02, 0x01])
    })

    it('payload de 7 bytes (limite SF) → 1 SF con PCI 0x07', () => {
      const payload = payloadBytes(7)
      const result = segmentPayload(payload)
      expect(result).toHaveLength(1)
      expect(getPci(result[0])).toBe(0x07)
      expect(result[0].data).toEqual([0x07, ...payload])
    })
  })

  describe('Multi-Frame', () => {
    it('payload de 8 bytes (fuerza FF) → FF + CF seq1', () => {
      const payload = payloadBytes(8)
      const result = segmentPayload(payload)
      expect(result).toHaveLength(2)
      expect(getPci(result[0])).toBe(0x10)
      expect(result[0].data[1]).toBe(0x08)
      expect(result[0].data.slice(2)).toEqual(payload.slice(0, 6))
      expect(getPci(result[1])).toBe(0x21)
      expect(result[1].data.slice(1)).toEqual(payload.slice(6, 8))
    })

    it('payload de 19 bytes (VIN) → FF + CF seq1 + CF seq2', () => {
      const payload = payloadBytes(19)
      const result = segmentPayload(payload)
      expect(result).toHaveLength(3)
      expect(getPci(result[0])).toBe(0x10)
      expect(result[0].data[1]).toBe(0x13)
      expect(result[0].data.slice(2)).toEqual(payload.slice(0, 6))
      expect(getPci(result[1])).toBe(0x21)
      expect(result[1].data.slice(1)).toEqual(payload.slice(6, 13))
      expect(getPci(result[2])).toBe(0x22)
      expect(result[2].data.slice(1)).toEqual(payload.slice(13, 19))
    })

    it('payload de 20 bytes → FF + CF1 + CF2', () => {
      const payload = payloadBytes(20)
      const result = segmentPayload(payload)
      expect(result).toHaveLength(3)
      expect(getPci(result[0])).toBe(0x10)
      expect(result[0].data[1]).toBe(0x14)
      expect(result[0].data.slice(2)).toEqual(payload.slice(0, 6))
      expect(getPci(result[1])).toBe(0x21)
      expect(result[1].data.slice(1)).toEqual(payload.slice(6, 13))
      expect(getPci(result[2])).toBe(0x22)
      expect(result[2].data.slice(1)).toEqual(payload.slice(13, 20))
    })
  })

  describe('Sequence rollover', () => {
    it('payload de 200 bytes → seq numbers 1..15, 1..15 sin gaps', () => {
      const payload = payloadBytes(200)
      const result = segmentPayload(payload)
      expect(result).toHaveLength(1 + Math.ceil((200 - 6) / 7))

      const cfFrames = result.slice(1)
      let expectedSeq = 1
      for (const frame of cfFrames) {
        const info = parsePci(frame.data[0])
        expect(info.type).toBe(FrameType.CONSECUTIVE)
        expect(info.sequenceNumber).toBe(expectedSeq)
        expectedSeq = (expectedSeq + 1) & 0x0f
      }
    })
  })

  describe('Payload maximo', () => {
    it('payload de 4095 bytes → FF + CFs validos', () => {
      const payload = payloadBytes(4095)
      const result = segmentPayload(payload)
      expect(result[0].data[0]).toBe(0x1f)
      expect(result[0].data[1]).toBe(0xff)
      expect(result[0].data.slice(2)).toEqual(payload.slice(0, 6))

      const expectedCFs = Math.ceil((4095 - 6) / 7)
      expect(result).toHaveLength(1 + expectedCFs)

      const reassembled = reassembleFrames(result)
      expect(reassembled).toEqual(payload)
    })
  })

  describe('Payload excede maximo', () => {
    it('payload de 4096 bytes → lanza IsotpOverflowError', () => {
      const payload = payloadBytes(4096)
      expect(() => segmentPayload(payload)).toThrow(IsotpOverflowError)
    })
  })

  describe('Payload vacio', () => {
    it('segmentPayload([]) → lanza error', () => {
      expect(() => segmentPayload([])).toThrow()
    })
  })

  describe('MTU personalizado', () => {
    it('MTU=16, payload de 15 bytes → 1 SF (hasta 15 bytes de payload)', () => {
      const payload = payloadBytes(15)
      const result = segmentPayload(payload, 16)
      expect(result).toHaveLength(1)
      expect(getPci(result[0])).toBe(0x0f)
      expect(result[0].data).toEqual([0x0f, ...payload])
    })

    it('MTU=16, payload de 16 bytes → FF + CF (14 + 2)', () => {
      const payload = payloadBytes(16)
      const result = segmentPayload(payload, 16)
      expect(result).toHaveLength(2)
      expect(getPci(result[0])).toBe(0x10)
      expect(result[0].data[1]).toBe(0x10)
      expect(result[0].data.slice(2)).toEqual(payload.slice(0, 14))
      expect(getPci(result[1])).toBe(0x21)
      expect(result[1].data.slice(1)).toEqual(payload.slice(14, 16))
    })

    it('MTU=16, payload de 30 bytes → FF + CF1 + CF2 (14 + 15 + 1)', () => {
      const payload = payloadBytes(30)
      const result = segmentPayload(payload, 16)
      expect(result).toHaveLength(3)
      expect(getPci(result[0])).toBe(0x10)
      expect(result[0].data[1]).toBe(0x1e)
      expect(getPci(result[1])).toBe(0x21)
      expect(getPci(result[2])).toBe(0x22)
    })
  })
})

describe('computeFrameCount', () => {
  it('payload de 3 bytes con MTU=8 → 1 frame (SF)', () => {
    expect(computeFrameCount(3, 8)).toBe(1)
  })

  it('payload de 7 bytes con MTU=8 → 1 frame (SF en limite)', () => {
    expect(computeFrameCount(7, 8)).toBe(1)
  })

  it('payload de 8 bytes con MTU=8 → 2 frames (FF + 1 CF)', () => {
    expect(computeFrameCount(8, 8)).toBe(2)
  })

  it('payload de 19 bytes con MTU=8 → 3 frames', () => {
    expect(computeFrameCount(19, 8)).toBe(3)
  })

  it('payload de 4095 bytes con MTU=8 → 586 frames', () => {
    expect(computeFrameCount(4095, 8)).toBe(586)
  })

  it('payload de 15 bytes con MTU=16 → 1 frame (SF)', () => {
    expect(computeFrameCount(15, 16)).toBe(1)
  })

  it('payload de 16 bytes con MTU=16 → 2 frames (FF + 1 CF)', () => {
    expect(computeFrameCount(16, 16)).toBe(2)
  })
})
