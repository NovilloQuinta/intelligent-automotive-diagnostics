/** Error lanzado cuando falla la decodificacion o validacion de un VIN. */
export class VinDecodeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VinDecodeError'
  }
}

/** Mapa de transliteracion VIN: letras a valores numericos (ISO 3779). */
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

const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2]

const FORBIDDEN_CHARS = new Set(['I', 'O', 'Q'])

const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/

/** Value Object que representa un VIN valido segun ISO 3779. */
export class Vin {
  private constructor(readonly value: string) {}

  /** Crea un Vin validado. Lanza VinDecodeError si el formato es invalido. */
  static create(raw: string): Vin {
    const cleaned = raw.toUpperCase().replace(/\s/g, '')
    validateFormat(cleaned)
    return new Vin(cleaned)
  }

  toString(): string {
    return this.value
  }
}

/** Valida que un VIN cumpla el formato ISO 3779.
 * @returns El VIN validado en mayusculas.
 * @throws {VinDecodeError} si el formato es invalido.
 */
export function validateVin(vin: string): string {
  const upper = vin.toUpperCase()
  validateFormat(upper)
  return upper
}

/** Valida que un string cumpla el formato ISO 3779 (17 chars, sin I/O/Q, alfanumerico).
 * @throws {VinDecodeError} si el formato es invalido.
 */
function validateFormat(vin: string): void {
  if (vin.length !== 17) {
    throw new VinDecodeError(`VIN must be exactly 17 characters, got ${vin.length}`)
  }
  if (!VIN_REGEX.test(vin)) {
    for (let i = 0; i < vin.length; i++) {
      const ch = vin[i]
      if (FORBIDDEN_CHARS.has(ch)) {
        throw new VinDecodeError(`VIN contains forbidden character '${ch}' at position ${i}`)
      }
      if (!/[A-Z0-9]/.test(ch)) {
        throw new VinDecodeError(`VIN contains invalid character '${ch}' at position ${i}`)
      }
    }
  }
}

/** Comprueba el check digit del VIN (posicion 9, 0-indexed: 8). */
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

/** Decodifica los primeros 3 caracteres del VIN (WMI) e identifica pais y region. */
export function decodeWmi(vin: string): { country: string; region: string } | null {
  if (vin.length < 3) return null
  const wmi = vin.slice(0, 2)

  if (/^[S][A-Z]/.test(wmi)) return { country: 'United Kingdom', region: 'Europe' }
  if (/^[W]/.test(wmi)) return { country: 'Germany', region: 'Europe' }
  if (/^[V][F-V]/.test(wmi)) return { country: 'France', region: 'Europe' }
  if (/^[Z][A-Z]/.test(wmi)) return { country: 'Italy', region: 'Europe' }
  if (/^[Y][A-Z]/.test(wmi)) return { country: 'Sweden/Belgium/Finland', region: 'Europe' }
  if (/^[U][A-Z]/.test(wmi)) return { country: 'Spain', region: 'Europe' }
  if (/^[T][A-Z]/.test(wmi))
    return { country: 'Switzerland/Czech Republic/Hungary', region: 'Europe' }
  if (/^[V][A]/.test(wmi)) return { country: 'Austria', region: 'Europe' }

  if (/^[J]/.test(wmi)) return { country: 'Japan', region: 'Asia' }
  if (/^[K][A-Z]/.test(wmi)) return { country: 'South Korea', region: 'Asia' }
  if (/^[L]/.test(wmi)) return { country: 'China', region: 'Asia' }

  if (/^[1-5]/.test(wmi)) return { country: 'United States', region: 'North America' }
  if (/^[2]/.test(wmi)) return { country: 'Canada', region: 'North America' }
  if (/^[3][A-X]/.test(wmi)) return { country: 'Mexico', region: 'North America' }

  return null
}
