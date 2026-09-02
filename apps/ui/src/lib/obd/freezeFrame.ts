/**
 * Snapshot de sensores al disparar un DTC (Service 02), portado de
 * `apps/core-api/src/domain/value-objects/FreezeFrame.ts`.
 */

/** Error lanzado cuando falla la validacion de un FreezeFrame. */
export class FreezeFrameError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FreezeFrameError'
  }
}

/** Snapshot de valores de sensores en el momento en que se disparo un DTC. */
export class FreezeFrame {
  readonly dtcCode: string
  readonly pidValues: Readonly<Record<string, number>>

  constructor(params: { dtcCode: string; pidValues: Record<string, number> }) {
    const dtcCode = params.dtcCode.trim()
    if (dtcCode.length === 0) {
      throw new FreezeFrameError('FreezeFrame dtcCode must not be empty')
    }
    if (Object.keys(params.pidValues).length === 0) {
      throw new FreezeFrameError('FreezeFrame pidValues must not be empty')
    }
    this.dtcCode = dtcCode
    this.pidValues = { ...params.pidValues }
  }

  get pidKeys(): string[] {
    return Object.keys(this.pidValues)
  }

  getPidValue(pid: string): number | undefined {
    return this.pidValues[pid]
  }
}
