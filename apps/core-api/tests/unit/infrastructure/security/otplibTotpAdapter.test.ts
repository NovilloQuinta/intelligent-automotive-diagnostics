import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { generateSync } from 'otplib'
import { OtplibTotpAdapter } from '@/infrastructure/security/OtplibTotpAdapter.js'
import { TOTP_PERIOD_SECONDS } from '@/domain/twoFactor.js'

const NOW = new Date('2026-08-26T12:00:00.000Z')
const PERIOD_MS = TOTP_PERIOD_SECONDS * 1000

/** Codigo valido para el instante indicado, generado con la misma libreria. */
function codeAt(secret: string, at: Date): string {
  return generateSync({ secret, epoch: Math.floor(at.getTime() / 1000) })
}

describe('OtplibTotpAdapter', () => {
  let adapter: OtplibTotpAdapter

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    adapter = new OtplibTotpAdapter()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('generateSecret', () => {
    it('devuelve un secreto en Base32, que es lo que leen las apps', () => {
      expect(adapter.generateSecret()).toMatch(/^[A-Z2-7]+$/)
    })

    it('no repite el secreto entre altas', () => {
      expect(adapter.generateSecret()).not.toBe(adapter.generateSecret())
    })
  })

  describe('verify', () => {
    it('acepta el codigo del paso actual', () => {
      const secret = adapter.generateSecret()

      expect(adapter.verify(secret, codeAt(secret, NOW))).toBe(true)
    })

    it('acepta el del paso anterior, para el reloj algo atrasado', () => {
      const secret = adapter.generateSecret()
      const previous = codeAt(secret, new Date(NOW.getTime() - PERIOD_MS))

      expect(adapter.verify(secret, previous)).toBe(true)
    })

    it('acepta el del paso siguiente, para el reloj algo adelantado', () => {
      const secret = adapter.generateSecret()
      const next = codeAt(secret, new Date(NOW.getTime() + PERIOD_MS))

      expect(adapter.verify(secret, next)).toBe(true)
    })

    it('rechaza uno de dos pasos atras: la ventana es de uno, no abierta', () => {
      const secret = adapter.generateSecret()
      const old = codeAt(secret, new Date(NOW.getTime() - PERIOD_MS * 2))

      expect(adapter.verify(secret, old)).toBe(false)
    })

    it('rechaza el codigo de otro secreto', () => {
      const mine = adapter.generateSecret()
      const other = adapter.generateSecret()

      expect(adapter.verify(mine, codeAt(other, NOW))).toBe(false)
    })

    it('rechaza basura sin lanzar', () => {
      const secret = adapter.generateSecret()

      expect(adapter.verify(secret, 'no-es-un-codigo')).toBe(false)
      expect(adapter.verify(secret, '')).toBe(false)
    })

    it('no lanza si el secreto almacenado esta corrupto', () => {
      // Un secreto que no es Base32 valido no debe tumbar el login con un 500.
      expect(adapter.verify('###', '123456')).toBe(false)
    })
  })

  describe('toQrDataUri', () => {
    it('devuelve una imagen PNG embebida, lista para un <img src>', async () => {
      const uri = 'otpauth://totp/IAD:a@b.com?secret=JBSWY3DPEHPK3PXP&issuer=IAD'

      await expect(adapter.toQrDataUri(uri)).resolves.toMatch(/^data:image\/png;base64,/)
    })
  })
})
