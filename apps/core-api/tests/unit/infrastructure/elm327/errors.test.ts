import { describe, it, expect } from 'vitest'
import {
  Elm327ConnectionError,
  Elm327NoDataError,
  Elm327ParseError,
} from '@/infrastructure/elm327/errors.js'

describe('Elm327Errors', () => {
  describe('Elm327ConnectionError', () => {
    it('should set name to Elm327ConnectionError and preserve message', () => {
      const err = new Elm327ConnectionError('TCP timeout')
      expect(err.name).toBe('Elm327ConnectionError')
      expect(err.message).toBe('TCP timeout')
      expect(err).toBeInstanceOf(Error)
    })
  })

  describe('Elm327NoDataError', () => {
    it('should set name to Elm327NoDataError and include raw in message', () => {
      const raw = '01 0C\rNO DATA'
      const err = new Elm327NoDataError(raw)
      expect(err.name).toBe('Elm327NoDataError')
      expect(err.message).toContain('no data')
      expect(err.message).toContain(raw)
      expect(err).toBeInstanceOf(Error)
    })
  })

  describe('Elm327ParseError', () => {
    it('should set name to Elm327ParseError and include raw in message', () => {
      const raw = 'CAN ERROR'
      const err = new Elm327ParseError(raw)
      expect(err.name).toBe('Elm327ParseError')
      expect(err.message).toContain('unparseable')
      expect(err.message).toContain(raw)
      expect(err).toBeInstanceOf(Error)
    })
  })
})
