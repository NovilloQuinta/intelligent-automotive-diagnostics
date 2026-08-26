import { describe, it, expect } from 'vitest'
import {
  TOTP_DIGITS,
  TOTP_PERIOD_SECONDS,
  TOTP_WINDOW_STEPS,
  TOTP_ALGORITHM,
  RECOVERY_CODE_COUNT,
  buildOtpauthUri,
  generateRecoveryCodes,
  normalizeTwoFactorCode,
  isRecoveryCodeShaped,
} from '@/domain/twoFactor.js'

describe('constantes RFC 6238 del proyecto', () => {
  it('fija los parametros que espera cualquier app TOTP estandar', () => {
    expect(TOTP_DIGITS).toBe(6)
    expect(TOTP_PERIOD_SECONDS).toBe(30)
    expect(TOTP_ALGORITHM).toBe('SHA1')
  })

  it('admite un paso de desfase a cada lado, por el reloj del servidor', () => {
    expect(TOTP_WINDOW_STEPS).toBe(1)
  })
})

describe('buildOtpauthUri', () => {
  const params = { issuer: 'IAD', account: 'taller@example.com', secret: 'JBSWY3DPEHPK3PXP' }

  it('construye una URI otpauth de tipo totp', () => {
    expect(buildOtpauthUri(params)).toMatch(/^otpauth:\/\/totp\//)
  })

  it('etiqueta la cuenta como emisor:cuenta, que es lo que pinta la app', () => {
    expect(buildOtpauthUri(params)).toContain(encodeURIComponent('IAD:taller@example.com'))
  })

  it('lleva el secreto y los parametros del algoritmo', () => {
    const uri = buildOtpauthUri(params)
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP')
    expect(uri).toContain('issuer=IAD')
    expect(uri).toContain('algorithm=SHA1')
    expect(uri).toContain('digits=6')
    expect(uri).toContain('period=30')
  })

  it('escapa los caracteres reservados del email', () => {
    const uri = buildOtpauthUri({ ...params, account: 'a+b@example.com' })
    expect(uri).not.toContain('a+b@example.com')
    expect(uri).toContain(encodeURIComponent('IAD:a+b@example.com'))
  })
})

describe('generateRecoveryCodes', () => {
  it('genera diez codigos', () => {
    expect(generateRecoveryCodes()).toHaveLength(RECOVERY_CODE_COUNT)
  })

  it('no repite ninguno', () => {
    const codes = generateRecoveryCodes()
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('no repite entre dos invocaciones', () => {
    const primera = generateRecoveryCodes()
    const segunda = generateRecoveryCodes()
    expect(primera.some((code) => segunda.includes(code))).toBe(false)
  })

  it('usa un formato legible en dos bloques separados por guion', () => {
    for (const code of generateRecoveryCodes()) {
      expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/)
    }
  })

  it('evita los caracteres que se confunden al copiarlos a mano', () => {
    // O/0, I/1 y similares generan tickets de soporte, no seguridad.
    for (const code of generateRecoveryCodes()) {
      expect(code).not.toMatch(/[O0I1L]/)
    }
  })
})

describe('normalizeTwoFactorCode', () => {
  it('quita espacios que la app pone para agrupar los digitos', () => {
    expect(normalizeTwoFactorCode('123 456')).toBe('123456')
  })

  it('quita los guiones de los codigos de recuperacion', () => {
    expect(normalizeTwoFactorCode('AB2C-XY7Z')).toBe('AB2CXY7Z')
  })

  it('pasa a mayusculas para que el codigo de recuperacion no dependa del teclado', () => {
    expect(normalizeTwoFactorCode('ab2c-xy7z')).toBe('AB2CXY7Z')
  })

  it('recorta los espacios de un pegado descuidado', () => {
    expect(normalizeTwoFactorCode('  123456  ')).toBe('123456')
  })
})

describe('isRecoveryCodeShaped', () => {
  it('reconoce un codigo de recuperacion ya normalizado', () => {
    expect(isRecoveryCodeShaped('AB2CXY7Z')).toBe(true)
  })

  it('no confunde un TOTP de seis digitos con uno de recuperacion', () => {
    expect(isRecoveryCodeShaped('123456')).toBe(false)
  })

  it('rechaza cualquier otra longitud', () => {
    expect(isRecoveryCodeShaped('AB2C')).toBe(false)
    expect(isRecoveryCodeShaped('AB2CXY7ZQ')).toBe(false)
  })
})
