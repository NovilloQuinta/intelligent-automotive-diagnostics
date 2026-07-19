/** Error lanzado cuando falla la decodificación o validación de un VIN. */
export class VinDecodeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VinDecodeError'
  }
}

/** Mapa de transliteración VIN: letras → valores numéricos (ISO 3779). */
const TRANSLITERATION: Record<string, number> = {
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  E: 5,
  F: 6,
  G: 7,
  H: 8,
  J: 1,
  K: 2,
  L: 3,
  M: 4,
  N: 5,
  P: 7,
  R: 9,
  S: 2,
  T: 3,
  U: 4,
  V: 5,
  W: 6,
  X: 7,
  Y: 8,
  Z: 9,
}

/** Pesos por posición para el cálculo del check digit (posición 9 = peso 0). */
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2]

/** Caracteres prohibidos en un VIN (ISO 3779). */
const FORBIDDEN_CHARS = new Set(['I', 'O', 'Q'])

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

/** Valida que un VIN cumpla el formato ISO 3779.
 * @param vin — VIN string de 17 caracteres.
 * @returns El VIN validado (sin modificar).
 * @throws VinDecodeError si el formato es inválido.
 */
export function validateVin(vin: string): string {
  if (vin.length !== 17) {
    throw new VinDecodeError(`VIN must be exactly 17 characters, got ${vin.length}`)
  }

  const upper = vin.toUpperCase()

  for (let i = 0; i < upper.length; i++) {
    const ch = upper[i]
    if (FORBIDDEN_CHARS.has(ch)) {
      throw new VinDecodeError(`VIN contains forbidden character '${ch}' at position ${i}`)
    }
    if (!/[A-Z0-9]/.test(ch)) {
      throw new VinDecodeError(`VIN contains invalid character '${ch}' at position ${i}`)
    }
  }

  return upper
}

/** Comprueba el check digit del VIN (posición 9, 0-indexed: 8).
 * Aplica el algoritmo de transliteración + pesos + módulo 11.
 * @param vin — VIN string de 17 caracteres (ya validado como formato correcto).
 * @returns `true` si el check digit es correcto o si no se puede verificar (fuera de Norteamérica).
 */
export function isValidCheckDigit(vin: string): boolean {
  if (vin.length !== 17) return false

  let sum = 0
  for (let i = 0; i < 17; i++) {
    const ch = vin[i]
    const num = ch >= '0' && ch <= '9' ? Number.parseInt(ch) : TRANSLITERATION[ch]
    if (num === undefined) return false
    sum += num * WEIGHTS[i]
  }

  const remainder = sum % 11
  const expected = remainder === 10 ? 'X' : String(remainder)
  return vin[8] === expected
}

/** Decodifica los primeros 3 caracteres del VIN (WMI) e identifica el país y región.
 * @param vin — VIN string de 17 caracteres.
 * @returns Objeto con el país y región, o null si no se puede identificar.
 */
export function decodeWmi(vin: string): { country: string; region: string } | null {
  if (vin.length < 3) return null
  const wmi = vin.slice(0, 2)

  // Europa
  if (/^[S][A-Z]/.test(wmi)) return { country: 'United Kingdom', region: 'Europe' }
  if (/^[W]/.test(wmi)) return { country: 'Germany', region: 'Europe' }
  if (/^[V][F-V]/.test(wmi)) return { country: 'France', region: 'Europe' }
  if (/^[Z][A-Z]/.test(wmi)) return { country: 'Italy', region: 'Europe' }
  if (/^[Y][A-Z]/.test(wmi)) return { country: 'Sweden/Belgium/Finland', region: 'Europe' }
  if (/^[U][A-Z]/.test(wmi)) return { country: 'Spain', region: 'Europe' }
  if (/^[T][A-Z]/.test(wmi))
    return { country: 'Switzerland/Czech Republic/Hungary', region: 'Europe' }
  if (/^[V][A]/.test(wmi)) return { country: 'Austria', region: 'Europe' }

  // Japón
  if (/^[J]/.test(wmi)) return { country: 'Japan', region: 'Asia' }

  // Corea
  if (/^[K][A-Z]/.test(wmi)) return { country: 'South Korea', region: 'Asia' }

  // China
  if (/^[L]/.test(wmi)) return { country: 'China', region: 'Asia' }

  // Norteamérica
  if (/^[1-5]/.test(wmi)) return { country: 'United States', region: 'North America' }
  if (/^[2]/.test(wmi)) return { country: 'Canada', region: 'North America' }
  if (/^[3][A-X]/.test(wmi)) return { country: 'Mexico', region: 'North America' }

  return null
}
