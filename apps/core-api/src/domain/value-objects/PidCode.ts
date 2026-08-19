/** Error lanzado cuando falla la validacion de un codigo PID OBD-II. */
export class PidCodeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PidCodeError'
  }
}

const MODE_REGEX = /^[0-9A-Fa-f]{2}$/

const PID_REGEX = /^[0-9A-Fa-f]{2,4}$/

/** Modos OBD-II que solo aceptan PIDs estandar de 2 hex digits (Service 01-09). */
const STANDARD_MODES = new Set(['01', '02', '05', '06', '08', '09'])

/** Value Object que representa un codigo de PID OBD-II validado. */
export class PidCode {
  readonly mode: string
  readonly pid: string

  /**
   * @param mode - Modo OBD-II (2 digitos hex, ej. '01', '22').
   * @param pid - Codigo PID/DID (2-4 digitos hex, ej. '0C', '1130').
   * @throws {PidCodeError} Si el modo o el PID no cumplen el formato hex, o si un
   *   modo estandar (Service 01-09) recibe un PID de mas de 2 digitos.
   */
  constructor(mode: string, pid: string) {
    if (!MODE_REGEX.test(mode)) {
      throw new PidCodeError(`Invalid OBD mode: "${mode}". Must be 2 hex digits.`)
    }
    if (!PID_REGEX.test(pid)) {
      throw new PidCodeError(`Invalid PID code: "${pid}". Must be 2-4 hex digits.`)
    }
    const upperMode = mode.toUpperCase()
    if (STANDARD_MODES.has(upperMode) && pid.length !== 2) {
      throw new PidCodeError(`Mode ${upperMode} only accepts 2-character PIDs, got "${pid}".`)
    }
    this.mode = upperMode
    this.pid = pid.toUpperCase()
  }

  /** Clave compuesta para busquedas (ej. "01 0C"). */
  get key(): string {
    return `${this.mode} ${this.pid}`
  }

  toString(): string {
    return this.key
  }
}
