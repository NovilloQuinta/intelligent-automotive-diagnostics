/** Value Object que representa un codigo de PID OBD-II validado. */
export class PidCode {
  private constructor(
    readonly mode: string,
    readonly pid: string,
  ) {}

  /** Crea un PidCode validado. Lanza Error si mode o pid son invalidos. */
  static create(mode: string, pid: string): PidCode {
    if (!/^[0-9A-Fa-f]{2}$/.test(mode)) {
      throw new Error(`Invalid OBD mode: "${mode}". Must be 2 hex digits.`)
    }
    if (!/^[0-9A-Fa-f]{2,4}$/.test(pid)) {
      throw new Error(`Invalid PID code: "${pid}". Must be 2-4 hex digits.`)
    }
    return new PidCode(mode.toUpperCase(), pid.toUpperCase())
  }

  /** Crea un PidCode sin validar (para fuentes confiables como BD interna). */
  static fromTrusted(mode: string, pid: string): PidCode {
    return new PidCode(mode.toUpperCase(), pid.toUpperCase())
  }

  /** Clave compuesta para busquedas (ej. "01 0C"). */
  get key(): string {
    return `${this.mode} ${this.pid}`
  }

  toString(): string {
    return this.key
  }
}
