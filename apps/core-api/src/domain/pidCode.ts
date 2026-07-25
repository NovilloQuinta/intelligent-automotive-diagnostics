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
  private constructor(
    readonly mode: string,
    readonly pid: string,
  ) {}

  /** Crea un PidCode validado. Lanza PidCodeError si mode o pid son invalidos. */
  static create(mode: string, pid: string): PidCode {
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
    return new PidCode(upperMode, pid.toUpperCase())
  }

  /** Clave compuesta para busquedas (ej. "01 0C"). */
  get key(): string {
    return `${this.mode} ${this.pid}`
  }

  toString(): string {
    return this.key
  }
}
