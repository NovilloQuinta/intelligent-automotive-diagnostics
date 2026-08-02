import { describe, it, expect } from 'vitest'
import { DiagnosisResult, Severity } from '@/domain/diagnosisResult.js'
import { FreezeFrame } from '@/domain/freezeFrame.js'
import type { LiveData } from '@/domain/liveData.js'
import type { DtcCode } from '@/domain/dtcCode.js'

const sampleLiveData: LiveData = { rpm: 750, coolantTemp: 90, speed: 0, intakeTemp: 25 }
const sampleDtcCodes: DtcCode[] = [{ code: 'P0301', description: 'Cylinder 1 Misfire' }]

function mockFreezeFrame(): FreezeFrame {
  return FreezeFrame.create({
    dtcCode: 'P0301',
    pidValues: { rpm: 800, coolantTemp: 95, speed: 60 },
  })
}

describe('DiagnosisResult', () => {
  describe('computeSeverity', () => {
    it('should return Low when DTC count is zero', () => {
      expect(DiagnosisResult.computeSeverity(0, null)).toBe(Severity.Low)
    })

    it('should return Critical when DTC count > 0 and freeze frame is present', () => {
      expect(DiagnosisResult.computeSeverity(1, mockFreezeFrame())).toBe(Severity.Critical)
    })

    it('should return High when DTC count > 0 and no freeze frame', () => {
      expect(DiagnosisResult.computeSeverity(3, null)).toBe(Severity.High)
    })

    it('should return Low even when freeze frame is present but no DTCs', () => {
      expect(DiagnosisResult.computeSeverity(0, mockFreezeFrame())).toBe(Severity.Low)
    })
  })

  describe('create', () => {
    it('should derive High severity when DTCs are present without freeze frame', () => {
      const result = DiagnosisResult.create({
        parsedValues: sampleLiveData,
        dtcCodes: sampleDtcCodes,
        freezeFrame: null,
      })

      expect(result).toBeInstanceOf(DiagnosisResult)
      expect(result.severity).toBe(Severity.High)
    })

    it('should derive Critical severity when DTCs are present with freeze frame', () => {
      const result = DiagnosisResult.create({
        parsedValues: sampleLiveData,
        dtcCodes: sampleDtcCodes,
        freezeFrame: mockFreezeFrame(),
      })

      expect(result.severity).toBe(Severity.Critical)
    })

    it('should derive Low severity when no DTCs are present', () => {
      const result = DiagnosisResult.create({
        parsedValues: sampleLiveData,
        dtcCodes: [],
        freezeFrame: null,
      })

      expect(result.severity).toBe(Severity.Low)
    })

    it('should expose parsedValues and dtcCodes as readonly state', () => {
      const result = DiagnosisResult.create({
        parsedValues: sampleLiveData,
        dtcCodes: sampleDtcCodes,
        freezeFrame: null,
      })

      expect(result.parsedValues).toEqual(sampleLiveData)
      expect(result.dtcCodes).toEqual(sampleDtcCodes)
    })
  })

  describe('derived getters', () => {
    it('should return dtcCount as the number of DTC codes', () => {
      const result = DiagnosisResult.create({
        parsedValues: sampleLiveData,
        dtcCodes: sampleDtcCodes,
        freezeFrame: null,
      })

      expect(result.dtcCount).toBe(1)
    })

    it('should report hasFreezeFrame true when a freeze frame is present', () => {
      const result = DiagnosisResult.create({
        parsedValues: sampleLiveData,
        dtcCodes: sampleDtcCodes,
        freezeFrame: mockFreezeFrame(),
      })

      expect(result.hasFreezeFrame).toBe(true)
    })

    it('should report hasFreezeFrame false when no freeze frame is present', () => {
      const result = DiagnosisResult.create({
        parsedValues: sampleLiveData,
        dtcCodes: [],
        freezeFrame: null,
      })

      expect(result.hasFreezeFrame).toBe(false)
    })

    it('should not expose presentation fields rawData or diagnosisText', () => {
      const result = DiagnosisResult.create({
        parsedValues: sampleLiveData,
        dtcCodes: sampleDtcCodes,
        freezeFrame: null,
      })

      expect(result).not.toHaveProperty('rawData')
      expect(result).not.toHaveProperty('diagnosisText')
    })
  })
})
