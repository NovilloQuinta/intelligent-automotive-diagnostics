import type { Vin } from './Vin.js'

/** Primer año de fabricación de un automóvil (Benz Patent-Motorwagen). */
const MIN_VEHICLE_YEAR = 1886

/** Error lanzado cuando falla la validacion de un VehicleInfo. */
export class VehicleInfoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VehicleInfoError'
  }
}

/** Value Object con los datos de identificacion estatica del vehiculo bajo diagnostico. */
export class VehicleInfo {
  readonly make: string
  readonly model: string
  readonly year: number
  readonly engineType: string
  readonly vin: Vin
  readonly vinStatus: 'read' | 'unsupported' | 'unreadable'

  constructor(params: {
    make: string
    model: string
    year: number
    engineType: string
    vin: Vin
    vinStatus?: 'read' | 'unsupported' | 'unreadable'
  }) {
    if (!params.make.trim()) throw new VehicleInfoError('make must not be empty')
    if (!params.model.trim()) throw new VehicleInfoError('model must not be empty')
    if (params.year !== 0 && params.year < MIN_VEHICLE_YEAR)
      throw new VehicleInfoError(
        `year must be 0 (unknown) or >= ${MIN_VEHICLE_YEAR}, got ${params.year}`,
      )
    if (!params.engineType.trim()) throw new VehicleInfoError('engineType must not be empty')
    this.make = params.make.trim()
    this.model = params.model.trim()
    this.year = params.year
    this.engineType = params.engineType.trim()
    this.vin = params.vin
    this.vinStatus = params.vinStatus ?? 'read'
  }
}
