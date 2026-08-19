import type { EcuInfo } from './EcuInfo.js'
import type { PidDefinition } from './PidDefinition.js'
import type { Vin } from '../value-objects/Vin.js'

/** Primer año de fabricación de un automóvil. */
const MIN_YEAR = 1886

/** Error lanzado cuando falla la validacion de un VehicleProfile. */
export class VehicleProfileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VehicleProfileError'
  }
}

/** Entidad que representa el perfil completo de un vehiculo en el catalogo. */
export class VehicleProfile {
  readonly id: number
  readonly make: string
  readonly model: string
  readonly year: number
  readonly engineType: string
  readonly vin: Vin
  readonly firstSeen?: string
  readonly lastSeen?: string
  readonly ecus?: readonly EcuInfo[]
  readonly pids?: readonly PidDefinition[]

  constructor(params: {
    id: number
    make: string
    model: string
    year: number
    engineType: string
    vin: Vin
    firstSeen?: string
    lastSeen?: string
    ecus?: readonly EcuInfo[]
    pids?: readonly PidDefinition[]
  }) {
    if (!params.make.trim()) throw new VehicleProfileError('make must not be empty')
    if (!params.model.trim()) throw new VehicleProfileError('model must not be empty')
    if (params.year !== 0 && params.year < MIN_YEAR)
      throw new VehicleProfileError(
        `year must be 0 (unknown) or >= ${MIN_YEAR}, got ${params.year}`,
      )
    if (!params.engineType.trim()) throw new VehicleProfileError('engineType must not be empty')
    this.id = params.id
    this.make = params.make.trim()
    this.model = params.model.trim()
    this.year = params.year
    this.engineType = params.engineType.trim()
    this.vin = params.vin
    this.firstSeen = params.firstSeen
    this.lastSeen = params.lastSeen
    this.ecus = params.ecus
    this.pids = params.pids
  }
}
