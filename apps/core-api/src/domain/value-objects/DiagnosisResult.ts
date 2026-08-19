import type { LiveData } from './LiveData.js'
import type { DtcCode } from './DtcCode.js'
import type { FreezeFrame } from './FreezeFrame.js'

/** Nivel de criticidad de un diagnóstico. */
export enum Severity {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
  Critical = 'critical',
}

/** Resultado completo de un diagnóstico vehicular determinista (value object rico). */
export class DiagnosisResult {
  readonly parsedValues: LiveData
  readonly dtcCodes: DtcCode[]
  readonly freezeFrame: FreezeFrame | null

  constructor(params: {
    parsedValues: LiveData
    dtcCodes: DtcCode[]
    freezeFrame: FreezeFrame | null
  }) {
    this.parsedValues = params.parsedValues
    this.dtcCodes = [...params.dtcCodes]
    this.freezeFrame = params.freezeFrame
  }

  /**
   * Regla de negocio pura: calcula criticidad a partir del número de DTCs
   * y la presencia de freeze frame.
   */
  static computeSeverity(dtcCount: number, freezeFrame: FreezeFrame | null): Severity {
    if (dtcCount === 0) return Severity.Low
    if (freezeFrame) return Severity.Critical
    return Severity.High
  }

  /** Criticidad derivada del estado (DTCs + freeze frame), nunca inyectada por el caller. */
  get severity(): Severity {
    return DiagnosisResult.computeSeverity(this.dtcCodes.length, this.freezeFrame)
  }

  /** Número de códigos DTC del diagnóstico. */
  get dtcCount(): number {
    return this.dtcCodes.length
  }

  /** Indica si el diagnóstico incluye un freeze frame. */
  get hasFreezeFrame(): boolean {
    return this.freezeFrame !== null
  }
}
