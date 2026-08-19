import { describe, it, expect } from 'vitest'
import { FreezeFrame, FreezeFrameError } from '@/domain/value-objects/FreezeFrame.js'

describe('FreezeFrame', () => {
  describe('create', () => {
    it('should create a FreezeFrame with dtcCode and pidValues', () => {
      const frame = new FreezeFrame({ dtcCode: 'P0301', pidValues: { rpm: 800 } })

      expect(frame).toBeInstanceOf(FreezeFrame)
      expect(frame.dtcCode).toBe('P0301')
      expect(frame.pidValues).toEqual({ rpm: 800 })
    })

    it('should throw FreezeFrameError when dtcCode is empty', () => {
      expect(() => new FreezeFrame({ dtcCode: '', pidValues: { rpm: 800 } })).toThrow(
        FreezeFrameError,
      )
    })

    it('should throw FreezeFrameError when pidValues is empty', () => {
      expect(() => new FreezeFrame({ dtcCode: 'P0301', pidValues: {} })).toThrow(FreezeFrameError)
    })

    it('should expose readonly dtcCode and pidValues', () => {
      const frame = new FreezeFrame({
        dtcCode: 'P0301',
        pidValues: { rpm: 800, coolantTemp: 95 },
      })

      expect(frame.dtcCode).toBe('P0301')
      expect(frame.pidValues).toEqual({ rpm: 800, coolantTemp: 95 })
    })
  })

  describe('pidKeys', () => {
    it('should return the frozen PID keys in order', () => {
      const frame = new FreezeFrame({
        dtcCode: 'P0301',
        pidValues: { rpm: 800, coolantTemp: 95, speed: 60 },
      })

      expect(frame.pidKeys).toEqual(['rpm', 'coolantTemp', 'speed'])
    })
  })

  describe('getPidValue', () => {
    it('should return the frozen value for an existing PID', () => {
      const frame = new FreezeFrame({ dtcCode: 'P0301', pidValues: { rpm: 800 } })

      expect(frame.getPidValue('rpm')).toBe(800)
    })

    it('should return undefined for an unknown PID', () => {
      const frame = new FreezeFrame({ dtcCode: 'P0301', pidValues: { rpm: 800 } })

      expect(frame.getPidValue('fuelLevel')).toBeUndefined()
    })
  })
})
