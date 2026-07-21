import { VinDecodeError, validateVin } from '@/domain/vin.js'

/** Re-exporta funciones de validacion VIN desde dominio. */
export { VinDecodeError, validateVin, isValidCheckDigit, decodeWmi } from '@/domain/vin.js'

/** Convierte bytes ASCII de un VIN (Mode 09 PID 02) a string y lo valida.
 * @param bytes — 17 bytes ASCII del VIN.
 * @returns VIN string validado.
 * @throws VinDecodeError si el VIN no cumple ISO 3779.
 */
export function decodeVin(bytes: number[]): string {
  if (bytes.length !== 17) {
    throw new VinDecodeError(`VIN must be exactly 17 characters, got ${bytes.length} bytes`)
  }

  const vin = String.fromCharCode(...bytes)

  return validateVin(vin)
}
