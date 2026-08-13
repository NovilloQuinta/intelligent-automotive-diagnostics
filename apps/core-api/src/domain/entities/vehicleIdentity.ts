import { normalizeManufacturer } from '@/domain/value-objects/manufacturer.js'

/** Error lanzado cuando falla la validacion de una identidad de vehiculo. */
export class VehicleIdentityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VehicleIdentityError'
  }
}

/** Procedencias de una identidad, en el orden en que las resuelve la cascada. */
export type VehicleIdentitySource = 'seed' | 'web' | 'mechanic'

const VALID_SOURCES: readonly string[] = ['seed', 'web', 'mechanic']

/**
 * WMI valido: 3 caracteres del alfabeto VIN (ISO 3779, sin I/O/Q).
 *
 * Las tres letras excluidas no existen en ningun VIN porque se confunden con 1 y
 * 0, asi que un WMI que las lleve viene de una lectura mal decodificada.
 */
const WMI_REGEX = /^[A-HJ-NPR-Z0-9]{3}$/

/** Cota del nombre de fabricante: por encima de esto es texto pegado, no una marca. */
const MAX_MANUFACTURER_LENGTH = 64

/**
 * Fabricante asociado a un WMI (los 3 primeros caracteres del VIN).
 *
 * Es la unidad del catalogo de identificacion: responde "quien fabrico este
 * coche" sin depender de ninguna tabla en codigo. **Guarda solo el fabricante,
 * nunca el modelo**: el WMI identifica al fabricante — un `VF3` es un 208, un
 * 308 o un 3008 — asi que subir el modelo a esta clave seria falso aunque el
 * dato de origen fuese correcto. El modelo vive en la fila del vehiculo, por VIN.
 *
 * La normalizacion del nombre vive aqui, no en el formulario: la API es otra
 * puerta de entrada y tiene que cruzar la misma validacion.
 */
export class VehicleIdentity {
  readonly id: number
  readonly wmi: string
  readonly manufacturer: string
  readonly confidence: number
  readonly source: VehicleIdentitySource
  readonly createdAt?: string

  /**
   * @param params - Propiedades de la identidad.
   * @throws {VehicleIdentityError} Si el WMI no son 3 caracteres del alfabeto
   *   VIN, el fabricante queda vacio al normalizar o excede
   *   {@link MAX_MANUFACTURER_LENGTH}, `confidence` cae fuera de [0, 1], o
   *   `source` no es `seed` / `web` / `mechanic`.
   */
  constructor(params: {
    id: number
    wmi: string
    manufacturer: string
    confidence: number
    source: string
    createdAt?: string
  }) {
    const wmi = params.wmi.trim().toUpperCase()
    if (!WMI_REGEX.test(wmi)) {
      throw new VehicleIdentityError(`Invalid WMI: "${params.wmi}"`)
    }

    const manufacturer = normalizeManufacturer(params.manufacturer)
    if (!manufacturer) {
      throw new VehicleIdentityError('manufacturer must not be empty')
    }
    if (manufacturer.length > MAX_MANUFACTURER_LENGTH) {
      throw new VehicleIdentityError(
        `manufacturer must be at most ${MAX_MANUFACTURER_LENGTH} characters, got ${manufacturer.length}`,
      )
    }

    if (params.confidence < 0 || params.confidence > 1) {
      throw new VehicleIdentityError(`confidence must be between 0 and 1, got ${params.confidence}`)
    }

    if (!VALID_SOURCES.includes(params.source)) {
      throw new VehicleIdentityError(`Invalid vehicle identity source: "${params.source}"`)
    }

    this.id = params.id
    this.wmi = wmi
    this.manufacturer = manufacturer
    this.confidence = params.confidence
    this.source = params.source as VehicleIdentitySource
    this.createdAt = params.createdAt
  }
}
