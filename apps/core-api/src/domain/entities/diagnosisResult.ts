import type { LiveData } from './liveData.js'
import type { DtcCode } from './dtcCode.js'

export type Severity = 'low' | 'medium' | 'high' | 'critical'

export interface DiagnosisResult {
  readonly rawData: string
  readonly parsedValues: LiveData
  readonly dtcCodes: DtcCode[]
  readonly diagnosisText: string
  readonly severity: Severity
}
