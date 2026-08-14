import { describe, it, expect } from 'vitest'
import {
  READ_ONLY_OBD_MODES,
  UnsafeObdModeError,
  assertReadOnlyObdMode,
  isReadOnlyObdMode,
} from '@/domain/obdServiceMode.js'

describe('obdServiceMode', () => {
  describe('isReadOnlyObdMode', () => {
    it.each(['01', '02', '03', '05', '06', '07', '09', '0A', '22'])(
      'should accept mode %s as read-only',
      (mode) => {
        expect(isReadOnlyObdMode(mode)).toBe(true)
      },
    )

    it('should accept lowercase modes', () => {
      expect(isReadOnlyObdMode('0a')).toBe(true)
      expect(isReadOnlyObdMode('22')).toBe(true)
    })

    it.each([
      ['04', 'ClearDiagnosticInformation'],
      ['08', 'control de componente on-board'],
      ['10', 'DiagnosticSessionControl'],
      ['11', 'ECUReset'],
      ['14', 'ClearDiagnosticInformation UDS'],
      ['27', 'SecurityAccess'],
      ['28', 'CommunicationControl'],
      ['2E', 'WriteDataByIdentifier'],
      ['2F', 'InputOutputControlByIdentifier'],
      ['31', 'RoutineControl'],
      ['34', 'RequestDownload'],
      ['36', 'TransferData'],
      ['3E', 'TesterPresent'],
      ['85', 'ControlDTCSetting'],
    ])('should reject mode %s (%s) as not read-only', (mode) => {
      expect(isReadOnlyObdMode(mode)).toBe(false)
    })

    it('should reject malformed modes', () => {
      expect(isReadOnlyObdMode('')).toBe(false)
      expect(isReadOnlyObdMode('ATZ')).toBe(false)
      expect(isReadOnlyObdMode('1')).toBe(false)
      expect(isReadOnlyObdMode('01 04')).toBe(false)
    })

    it('should expose the allowlist as an immutable set', () => {
      expect(READ_ONLY_OBD_MODES.has('01')).toBe(true)
      expect(READ_ONLY_OBD_MODES.has('2F')).toBe(false)
    })
  })

  describe('assertReadOnlyObdMode', () => {
    it('should not throw for a read-only mode', () => {
      expect(() => assertReadOnlyObdMode('01')).not.toThrow()
    })

    it('should throw UnsafeObdModeError naming the rejected mode', () => {
      expect(() => assertReadOnlyObdMode('2F')).toThrow(UnsafeObdModeError)
      expect(() => assertReadOnlyObdMode('2F')).toThrow(/2F/)
    })

    it('should omit the transposition hint when the mode is not a valid PID', () => {
      expect(() => assertReadOnlyObdMode('ATZ')).toThrow(UnsafeObdModeError)
      expect(() => assertReadOnlyObdMode('ATZ')).not.toThrow(/If you meant/)
    })

    it('should hint the Mode 01 transposition when the mode is a valid PID', () => {
      // "2F" es nivel de combustible como PID y control de actuadores como modo:
      // el error debe empujar al llamante hacia la lectura que probablemente queria.
      expect(() => assertReadOnlyObdMode('2F')).toThrow(/mode "01"/)
    })
  })
})
