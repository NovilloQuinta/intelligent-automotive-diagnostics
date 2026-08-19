/** Error lanzado cuando falla la validacion de un PidReading. */
export class PidReadingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PidReadingError'
  }
}

const HEX_REGEX = /^[0-9A-Fa-f]+$/

/**
 * Entidad que representa la lectura de un PID en una sesion de diagnostico.
 *
 * `mode` + `pidCode` hacen la lectura autodescriptiva (interpretable sin JOIN a
 * `pid_definitions`); `pidDefId` es un soft link opcional a la definicion
 * canonica. `rawHex` admite separadores de espacio y se normaliza a hex puro.
 */
export class PidReading {
  readonly id: number
  readonly pidDefId?: number
  readonly mode: string
  readonly pidCode: string
  readonly sessionId: number
  readonly rawHex: string
  readonly parsedValue?: number
  readonly timestamp?: string

  constructor(params: {
    id: number
    pidDefId?: number
    mode: string
    pidCode: string
    sessionId: number
    rawHex: string
    parsedValue?: number
    timestamp?: string
  }) {
    if (!params.mode.trim()) throw new PidReadingError('mode must not be empty')
    if (!params.pidCode.trim()) throw new PidReadingError('pidCode must not be empty')
    const normalizedRawHex = params.rawHex.replace(/\s+/g, '')
    if (!HEX_REGEX.test(normalizedRawHex)) {
      throw new PidReadingError(`rawHex must be a valid hex string, got "${params.rawHex}"`)
    }
    this.id = params.id
    this.pidDefId = params.pidDefId
    this.mode = params.mode.trim().toUpperCase()
    this.pidCode = params.pidCode.trim().toUpperCase()
    this.sessionId = params.sessionId
    this.rawHex = normalizedRawHex.toUpperCase()
    this.parsedValue = params.parsedValue
    this.timestamp = params.timestamp
  }
}
