import { describe, it, expect } from 'vitest'
import { randomBytes } from 'node:crypto'
import {
  AesGcmSecretCipher,
  InvalidCipherKeyError,
  SecretDecryptionError,
} from '@/infrastructure/security/AesGcmSecretCipher.js'

/** Clave valida de 32 bytes en base64, como la que se pone en `TOTP_ENCRYPTION_KEY`. */
function validKey(): string {
  return randomBytes(32).toString('base64')
}

const SECRET = 'JBSWY3DPEHPK3PXP'

describe('AesGcmSecretCipher', () => {
  describe('ida y vuelta', () => {
    it('descifra lo que cifro', () => {
      const cipher = new AesGcmSecretCipher(validKey())

      expect(cipher.decrypt(cipher.encrypt(SECRET))).toBe(SECRET)
    })

    it('no deja el secreto legible en el texto cifrado', () => {
      const cipher = new AesGcmSecretCipher(validKey())

      expect(cipher.encrypt(SECRET)).not.toContain(SECRET)
    })

    it('sobrevive a una ida y vuelta por una columna de texto', () => {
      const cipher = new AesGcmSecretCipher(validKey())
      const stored = JSON.parse(JSON.stringify({ v: cipher.encrypt(SECRET) })) as { v: string }

      expect(cipher.decrypt(stored.v)).toBe(SECRET)
    })
  })

  describe('IV aleatorio', () => {
    it('cifra el mismo texto de dos formas distintas', () => {
      const cipher = new AesGcmSecretCipher(validKey())

      // Sin IV aleatorio, dos usuarios con el mismo secreto tendrian la misma fila
      // y la BD delataria esa coincidencia.
      expect(cipher.encrypt(SECRET)).not.toBe(cipher.encrypt(SECRET))
    })

    it('y aun asi descifra las dos', () => {
      const cipher = new AesGcmSecretCipher(validKey())

      expect(cipher.decrypt(cipher.encrypt(SECRET))).toBe(SECRET)
      expect(cipher.decrypt(cipher.encrypt(SECRET))).toBe(SECRET)
    })
  })

  describe('autenticacion', () => {
    it('falla en vez de devolver basura si manipulan el texto cifrado', () => {
      const cipher = new AesGcmSecretCipher(validKey())
      const encrypted = cipher.encrypt(SECRET)
      const tampered = `${encrypted.slice(0, -4)}AAAA`

      expect(() => cipher.decrypt(tampered)).toThrow(SecretDecryptionError)
    })

    it('rechaza un valor que no tiene el formato esperado', () => {
      const cipher = new AesGcmSecretCipher(validKey())

      expect(() => cipher.decrypt('no-es-un-texto-cifrado')).toThrow(SecretDecryptionError)
    })

    it('no descifra con otra clave', () => {
      const encrypted = new AesGcmSecretCipher(validKey()).encrypt(SECRET)

      expect(() => new AesGcmSecretCipher(validKey()).decrypt(encrypted)).toThrow(
        SecretDecryptionError,
      )
    })
  })

  describe('validacion de la clave', () => {
    it('exige exactamente 32 bytes', () => {
      expect(() => new AesGcmSecretCipher(randomBytes(16).toString('base64'))).toThrow(
        InvalidCipherKeyError,
      )
    })

    it('rechaza una clave vacia', () => {
      expect(() => new AesGcmSecretCipher('')).toThrow(InvalidCipherKeyError)
    })

    it('rechaza algo que no es base64 valido de 32 bytes', () => {
      expect(() => new AesGcmSecretCipher('clave-de-mentira')).toThrow(InvalidCipherKeyError)
    })
  })
})
