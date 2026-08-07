/** Error lanzado cuando falla la validacion de una ECU. */
export class EcuInfoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EcuInfoError'
  }
}

const CAN_ADDR_REGEX = /^[0-9A-Fa-f]+$/

/** Entidad que representa una unidad de control electronico descubierta en el bus CAN/OBD. */
export class EcuInfo {
  readonly id: number
  readonly vehicleId: number
  readonly name: string
  readonly requestAddr: string
  readonly responseAddr: string
  readonly type: string
  readonly protocol: string
  readonly discoveredAt?: string

  constructor(params: {
    id: number
    vehicleId: number
    name: string
    requestAddr: string
    responseAddr: string
    type: string
    protocol: string
    discoveredAt?: string
  }) {
    if (!params.name.trim()) throw new EcuInfoError('ECU name must not be empty')
    if (!CAN_ADDR_REGEX.test(params.requestAddr)) {
      throw new EcuInfoError(`Invalid CAN request address: "${params.requestAddr}"`)
    }
    if (!CAN_ADDR_REGEX.test(params.responseAddr)) {
      throw new EcuInfoError(`Invalid CAN response address: "${params.responseAddr}"`)
    }
    if (!params.protocol.trim()) throw new EcuInfoError('ECU protocol must not be empty')
    this.id = params.id
    this.vehicleId = params.vehicleId
    this.name = params.name.trim()
    this.requestAddr = params.requestAddr.toUpperCase()
    this.responseAddr = params.responseAddr.toUpperCase()
    this.type = params.type
    this.protocol = params.protocol
    this.discoveredAt = params.discoveredAt
  }
}
