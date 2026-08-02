import type { LiveData } from './liveData.js'
import type { DtcCode } from './dtcCode.js'
import type { FreezeFrame } from './freezeFrame.js'

/** Nivel de criticidad de un diagnóstico. */
export enum Severity {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
  Critical = 'critical',
}

/** Resultado completo de un diagnóstico vehicular determinista (value object rico). */
export class DiagnosisResult {
  private constructor(
    readonly parsedValues: LiveData,
    readonly dtcCodes: DtcCode[],
    readonly freezeFrame: FreezeFrame | null,
  ) {}

  /**
   * Regla de negocio pura: calcula criticidad a partir del número de DTCs
   * y la presencia de freeze frame.
   */
  static computeSeverity(dtcCount: number, freezeFrame: FreezeFrame | null): Severity {
    if (dtcCount === 0) return Severity.Low
    if (freezeFrame) return Severity.Critical
    return Severity.High
  }

  /** Crea un DiagnosisResult. La severidad se deriva del estado via {@link computeSeverity}. */
  static create(params: {
    parsedValues: LiveData
    dtcCodes: DtcCode[]
    freezeFrame: FreezeFrame | null
  }): DiagnosisResult {
    return new DiagnosisResult(params.parsedValues, [...params.dtcCodes], params.freezeFrame)
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
