/** Error lanzado cuando falla la validacion de un PidReading. */
export class PidReadingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PidReadingError'
  }
}

const HEX_REGEX = /^[0-9A-Fa-f]+$/

/** Entidad que representa la lectura de un PID en una sesion de diagnostico. */
export class PidReading {
  readonly id: number
  readonly pidDefId?: number
  readonly sessionId: string
  readonly rawHex: string
  readonly parsedValue?: number
  readonly timestamp?: string

  constructor(params: {
    id: number
    pidDefId?: number
    sessionId: string
    rawHex: string
    parsedValue?: number
    timestamp?: string
  }) {
    if (!params.sessionId.trim()) throw new PidReadingError('sessionId must not be empty')
    if (!HEX_REGEX.test(params.rawHex)) {
      throw new PidReadingError(`rawHex must be a valid hex string, got "${params.rawHex}"`)
    }
    this.id = params.id
    this.pidDefId = params.pidDefId
    this.sessionId = params.sessionId.trim()
    this.rawHex = params.rawHex.toUpperCase()
    this.parsedValue = params.parsedValue
    this.timestamp = params.timestamp
  }
}
