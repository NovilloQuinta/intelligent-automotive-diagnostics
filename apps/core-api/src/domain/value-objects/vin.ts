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
  [/^[2]/, { country: 'Canada', region: 'North America' }],
  [/^3[A-X]/, { country: 'Mexico', region: 'North America' }],
  [/^[145]/, { country: 'United States', region: 'North America' }],
]

/** Tabla ISO 3779: char posicion 10 → anio de modelo (ciclo mas reciente, 1980-2030). Excluye I/O/Q/U/Z/0. */
const MODEL_YEAR_TABLE: Record<string, number> = {
  A: 2010,
  B: 2011,
  C: 2012,
  D: 2013,
  E: 2014,
  F: 2015,
  G: 2016,
  H: 2017,
  J: 2018,
  K: 2019,
  L: 2020,
  M: 2021,
  N: 2022,
  P: 2023,
  R: 2024,
  S: 2025,
  T: 2026,
  V: 2027,
  W: 2028,
  X: 2029,
  Y: 2030,
  '1': 2001,
  '2': 2002,
  '3': 2003,
  '4': 2004,
  '5': 2005,
  '6': 2006,
  '7': 2007,
  '8': 2008,
  '9': 2009,
}

/** VIN de reserva cuando no se conoce el vehiculo (modo TCP directo, emulador sin escenario). */
export const FALLBACK_VIN = 'XXXXXXXXXXXXXXXXX' as const

function validateVin(vin: string): void {
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

/** Value Object que representa un VIN valido segun ISO 3779. */
export class Vin {
  readonly value: string

  constructor(raw: string) {
    const cleaned = raw.toUpperCase().replace(/\s/g, '')
    validateVin(cleaned)
    this.value = cleaned
  }

  /** Crea un Vin desde bytes ASCII (respuesta Mode 09 PID 02). */
  static fromBytes(bytes: number[]): Vin {
    if (bytes.length !== 17) {
      throw new VinDecodeError(`VIN must be exactly 17 characters, got ${bytes.length} bytes`)
    }
    return new Vin(String.fromCharCode(...bytes))
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

  /**
   * World Manufacturer Identifier: los 3 primeros caracteres.
   *
   * Es la clave con la que el catalogo resuelve el fabricante. El VO **no**
   * traduce WMI a marca: eso es una consulta de datos, no una regla posicional
   * de la ISO 3779, y vive en `vehicle_identities` para poder crecer.
   */
  get wmi(): string {
    return this.value.slice(0, 3)
  }

  /** Identifica pais y region a partir del WMI (primeros 2 caracteres del VIN). */
  get wmiRegion(): { country: string; region: string } | null {
    const wmi = this.value.slice(0, 2)
    for (const [regex, result] of WMI_REGISTRY) {
      if (regex.test(wmi)) return result
    }
    return null
  }

  /** Anio de modelo a partir de la posicion 10 del VIN (ISO 3779). */
  get modelYear(): number | null {
    return MODEL_YEAR_TABLE[this.value[9]] ?? null
  }

  toString(): string {
    return this.value
  }

  /** Serializes as the raw VIN string so JSON APIs return a string, not `{ value: ... }`. */
  toJSON(): string {
    return this.value
  }
}
