import { describe, it, expect } from 'vitest'
import { reassembleFrames } from '@/infrastructure/elm327/isotp/reassembler.js'
import {
  IsotpFrameError,
  IsotpSequenceError,
  IsotpTruncatedError,
} from '@/infrastructure/elm327/isotp/frameTypes.js'

function payloadBytes(count: number, offset = 0): number[] {
  return Array.from({ length: count }, (_, i) => (i + offset) % 256)
}

describe('reassembleFrames', () => {
  describe('Single Frame', () => {
    it('SF con PCI 0x07 + 7 bytes payload', () => {
      const frames = [{ data: [0x07, ...payloadBytes(7)] }]
      const result = reassembleFrames(frames)
      expect(result).toEqual(payloadBytes(7))
      expect(result).toHaveLength(7)
    })

    it('SF con PCI 0x03 + 3 bytes payload (minima request)', () => {
      const frames = [{ data: [0x03, 0x09, 0x02, 0x01] }]
      const result = reassembleFrames(frames)
      expect(result).toEqual([0x09, 0x02, 0x01])
    })

    it('SF con PCI 0x01 + 1 byte payload', () => {
      const frames = [{ data: [0x01, 0x42] }]
      const result = reassembleFrames(frames)
      expect(result).toEqual([0x42])
    })
  })

  describe('Multi-Frame (VIN 19 bytes)', () => {
    it('FF + CF seq1 + CF seq2 → 19 bytes reensamblados', () => {
      const vinPayload = payloadBytes(19)
      const frames = [
        { data: [0x10, 0x13, ...vinPayload.slice(0, 6)] },
        { data: [0x21, ...vinPayload.slice(6, 13)] },
        { data: [0x22, ...vinPayload.slice(13, 19)] },
      ]
      const result = reassembleFrames(frames)
      expect(result).toEqual(vinPayload)
      expect(result).toHaveLength(19)
    })
  })

  describe('Payload de 8 bytes (fuerza FF+1CF)', () => {
    it('FF (6 bytes) + CF seq1 (2 bytes) → 8 bytes', () => {
      const payload = payloadBytes(8)
      const frames = [
        { data: [0x10, 0x08, ...payload.slice(0, 6)] },
        { data: [0x21, ...payload.slice(6, 8)] },
      ]
      const result = reassembleFrames(frames)
      expect(result).toEqual(payload)
      expect(result).toHaveLength(8)
    })
  })

  describe('Sequence gap', () => {
    it('CF seq1, seq3 (falta seq2) → lanza IsotpSequenceError', () => {
      const payload = payloadBytes(25)
      const frames = [
        { data: [0x10, 0x19, ...payload.slice(0, 6)] },
        { data: [0x21, ...payload.slice(6, 13)] },
        { data: [0x23, ...payload.slice(13, 20)] },
      ]
      expect(() => reassembleFrames(frames)).toThrow(IsotpSequenceError)
    })
  })

  describe('Sequence wraparound', () => {
    it('seq 1..15 → seq 0 (mod 16 rollover) no lanza error', () => {
      const totalLength = 6 + 15 * 7 + 7
      const payload = payloadBytes(totalLength)
      const frames = [{ data: [0x10, totalLength & 0xff, ...payload.slice(0, 6)] }]
      let idx = 6
      for (let seq = 1; seq <= 15; seq++) {
        const chunkSize = Math.min(7, totalLength - idx)
        frames.push({ data: [0x20 | seq, ...payload.slice(idx, idx + chunkSize)] })
        idx += chunkSize
      }
      frames.push({ data: [0x20, ...payload.slice(idx, idx + 7)] })
      const result = reassembleFrames(frames)
      expect(result).toEqual(payload)
      expect(result).toHaveLength(totalLength)
    })
  })

  describe('Overflow', () => {
    it('FF sin CFs → payload truncado, lanza IsotpTruncatedError', () => {
      const frames = [{ data: [0x1f, 0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00] }]
      expect(() => reassembleFrames(frames)).toThrow(IsotpTruncatedError)
    })

    it('FF con 12-bit length = 4095 (maximo valido) no lanza overflow', () => {
      const payload = payloadBytes(4095)
      const frames = [{ data: [0x10 | (4095 >> 8), 4095 & 0xff, ...payload.slice(0, 6)] }]
      for (let idx = 6, seq = 1; idx < 4095; idx += 7, seq = (seq + 1) & 0xf) {
        frames.push({ data: [0x20 | seq, ...payload.slice(idx, idx + 7)] })
      }
      const result = reassembleFrames(frames)
      expect(result).toEqual(payload)
      expect(result).toHaveLength(4095)
    })
  })

  describe('Payload truncado', () => {
    it('FF declara 20 bytes pero solo llegan 10 → lanza IsotpTruncatedError', () => {
      const payload = payloadBytes(13)
      const frames = [
        { data: [0x10, 0x14, ...payload.slice(0, 6)] },
        { data: [0x21, ...payload.slice(6, 10)] },
      ]
      expect(() => reassembleFrames(frames)).toThrow(IsotpTruncatedError)
    })
  })

  describe('CF sin FF previo', () => {
    it('solo CF frames → lanza IsotpFrameError', () => {
      const frames = [{ data: [0x21, 0x01, 0x02, 0x03] }, { data: [0x22, 0x04, 0x05, 0x06] }]
      expect(() => reassembleFrames(frames)).toThrow(IsotpFrameError)
    })
  })

  describe('CF con datos insuficientes', () => {
    it('CF solo tiene PCI byte sin payload → lanza IsotpFrameError', () => {
      const payload = payloadBytes(8)
      const frames = [
        { data: [0x10, 0x08, ...payload.slice(0, 6)] },
        { data: [0x21] }, // only PCI byte, no payload
      ]
      expect(() => reassembleFrames(frames)).toThrow(IsotpFrameError)
    })
  })

  describe('Frame no-CF despues de FF', () => {
    it('FlowControl tras FF → lanza IsotpFrameError', () => {
      const payload = payloadBytes(8)
      const frames = [
        { data: [0x10, 0x08, ...payload.slice(0, 6)] },
        { data: [0x30, 0x00, 0x0a] }, // FlowControl instead of CF
      ]
      expect(() => reassembleFrames(frames)).toThrow(IsotpFrameError)
    })
  })

  describe('PCI byte invalido', () => {
    it('frame con PCI 0x40 → lanza IsotpFrameError', () => {
      const frames = [{ data: [0x40, 0x01, 0x02] }]
      expect(() => reassembleFrames(frames)).toThrow(IsotpFrameError)
    })
  })

  describe('Array vacio', () => {
    it('reassembleFrames([]) → lanza error', () => {
      expect(() => reassembleFrames([])).toThrow()
    })
  })

  describe('Frame sin datos', () => {
    it('frame con data vacio → lanza IsotpFrameError', () => {
      const frames = [{ data: [] }]
      expect(() => reassembleFrames(frames)).toThrow(IsotpFrameError)
    })
  })

  describe('FF sin length byte', () => {
    it('FF con solo PCI byte → lanza IsotpFrameError', () => {
      const frames = [{ data: [0x10] }]
      expect(() => reassembleFrames(frames)).toThrow(IsotpFrameError)
    })
  })

  describe('Dos Single Frames', () => {
    it('solo se permite uno; el segundo lanza error', () => {
      const frames = [{ data: [0x03, 0x01, 0x02, 0x03] }, { data: [0x02, 0x04, 0x05] }]
      expect(() => reassembleFrames(frames)).toThrow()
    })
  })
})
