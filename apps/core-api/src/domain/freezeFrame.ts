/** Error lanzado cuando falla la validacion de un FreezeFrame. */
export class FreezeFrameError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FreezeFrameError'
  }
}

/** Snapshot de valores de sensores en el momento en que se disparó un DTC (Service 02). */
export class FreezeFrame {
  private constructor(
    readonly dtcCode: string,
    readonly pidValues: Readonly<Record<string, number>>,
  ) {}

  /** Crea un FreezeFrame validado. Lanza FreezeFrameError si dtcCode o pidValues estan vacios. */
  static create(params: { dtcCode: string; pidValues: Record<string, number> }): FreezeFrame {
    const dtcCode = params.dtcCode.trim()
    if (dtcCode.length === 0) {
      throw new FreezeFrameError('FreezeFrame dtcCode must not be empty')
    }
    if (Object.keys(params.pidValues).length === 0) {
      throw new FreezeFrameError('FreezeFrame pidValues must not be empty')
    }
    return new FreezeFrame(dtcCode, { ...params.pidValues })
  }

  /** Claves de los PIDs congelados, en orden de insercion. */
  get pidKeys(): string[] {
    return Object.keys(this.pidValues)
  }

  /** Devuelve el valor congelado de un PID, o undefined si no existe. */
  getPidValue(pid: string): number | undefined {
    return this.pidValues[pid]
  }
}
