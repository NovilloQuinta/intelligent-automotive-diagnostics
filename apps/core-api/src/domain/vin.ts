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

const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/

const FORBIDDEN_CHARS = new Set(['I', 'O', 'Q'])

/** Registro WMI. Primera coincidencia gana (ordenado por especificidad). */
const WMI_REGISTRY: Array<[RegExp, { country: string; region: string }]> = [
  [/^S[A-Z]/, { country: 'United Kingdom', region: 'Europe' }],
  [/^W/, { country: 'Germany', region: 'Europe' }],
  [/^V[F-V]/, { country: 'France', region: 'Europe' }],
  [/^Z[A-Z]/, { country: 'Italy', region: 'Europe' }],
  [/^Y[A-Z]/, { country: 'Sweden/Belgium/Finland', region: 'Europe' }],
  [/^U[A-Z]/, { country: 'Spain', region: 'Europe' }],
  [/^T[A-Z]/, { country: 'Switzerland/Czech Republic/Hungary', region: 'Europe' }],
  [/^VA/, { country: 'Austria', region: 'Europe' }],
  [/^J/, { country: 'Japan', region: 'Asia' }],
  [/^K[A-Z]/, { country: 'South Korea', region: 'Asia' }],
  [/^L/, { country: 'China', region: 'Asia' }],
  [/^[1-5]/, { country: 'United States', region: 'North America' }],
  [/^[2]/, { country: 'Canada', region: 'North America' }],
  [/^3[A-X]/, { country: 'Mexico', region: 'North America' }],
]

/** Value Object que representa un VIN valido segun ISO 3779. */
export class Vin {
  private constructor(readonly value: string) {}

  /** Crea un Vin validado. Lanza VinDecodeError si el formato es invalido. */
  static create(raw: string): Vin {
    const cleaned = raw.toUpperCase().replace(/\s/g, '')
    assertValidFormat(cleaned)
    return new Vin(cleaned)
  }

  /** Comprueba el check digit del VIN (posicion 9, 0-indexed: 8). */
  isCheckDigitValid(): boolean {
    let sum = 0
    for (let i = 0; i < 17; i++) {
      const ch = this.value[i]
      const num = ch >= '0' && ch <= '9' ? Number.parseInt(ch) : TRANSLITERATION[ch]!
      sum += num * WEIGHTS[i]
    }

    const remainder = sum % 11
    const expected = remainder === 10 ? 'X' : String(remainder)
    return this.value[8] === expected
  }

  /** Identifica pais y region a partir del WMI (primeros 2 caracteres del VIN). */
  get wmiRegion(): { country: string; region: string } | null {
    const wmi = this.value.slice(0, 2)
    for (const [regex, result] of WMI_REGISTRY) {
      if (regex.test(wmi)) return result
    }
    return null
  }

  toString(): string {
    return this.value
  }
}

/** @throws {VinDecodeError} si el formato es invalido. */
function assertValidFormat(vin: string): void {
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
