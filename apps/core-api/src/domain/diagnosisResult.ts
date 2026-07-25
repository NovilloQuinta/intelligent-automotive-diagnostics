import type { LiveData } from './liveData.js'
import type { DtcCode } from './dtcCode.js'

/** Nivel de criticidad de un diagnóstico. */
export enum Severity {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
  Critical = 'critical',
}

/** Resultado completo de un diagnóstico vehicular determinista. */
export interface DiagnosisResult {
  readonly rawData: string
  readonly parsedValues: LiveData
  readonly dtcCodes: DtcCode[]
  readonly diagnosisText: string
  readonly severity: Severity
}
