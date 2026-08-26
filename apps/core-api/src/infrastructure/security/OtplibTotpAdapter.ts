import { generateSecret, verifySync } from 'otplib'
import { toDataURL } from 'qrcode'
import type { TotpPort } from '@/application/ports/TotpPort.js'
import {
  TOTP_DIGITS,
  TOTP_PERIOD_SECONDS,
  TOTP_WINDOW_STEPS,
  TOTP_ALGORITHM,
} from '@/domain/twoFactor.js'

/** 20 bytes = 160 bits, lo que recomienda el RFC 4226 para el secreto compartido. */
const SECRET_BYTES = 20

/**
 * `otplib` expresa la tolerancia en **segundos**, no en pasos, asi que la ventana
 * del dominio se traduce multiplicando por el periodo.
 */
const EPOCH_TOLERANCE_SECONDS = TOTP_WINDOW_STEPS * TOTP_PERIOD_SECONDS

/**
 * Implementacion de {@link TotpPort} con `otplib` y `qrcode`.
 *
 * Es el unico fichero del proyecto que importa esas dos librerias. Todo lo demas
 * habla con el puerto, de modo que sustituirlas no obliga a tocar ningun caso de uso.
 */
export class OtplibTotpAdapter implements TotpPort {
  generateSecret(): string {
    return generateSecret({ length: SECRET_BYTES })
  }

  verify(secret: string, code: string): boolean {
    try {
      const result = verifySync({
        secret,
        token: code,
        algorithm: TOTP_ALGORITHM.toLowerCase() as 'sha1',
        digits: TOTP_DIGITS,
        period: TOTP_PERIOD_SECONDS,
        epochTolerance: EPOCH_TOLERANCE_SECONDS,
      })
      return result.valid
    } catch {
      // Un secreto corrupto en la BD o un codigo con caracteres raros no deben
      // tumbar el login con un 500: son simplemente una verificacion fallida.
      return false
    }
  }

  toQrDataUri(otpauthUri: string): Promise<string> {
    return toDataURL(otpauthUri)
  }
}
