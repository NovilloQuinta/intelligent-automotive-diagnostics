import type { LiveData } from '@/domain/entities/liveData.js'
import type { DtcCode } from '@/domain/entities/dtcCode.js'

/** Nivel de criticidad de un diagnóstico. */
export type Severity = 'low' | 'medium' | 'high' | 'critical'

/** Resultado completo de un diagnóstico vehicular determinista. */
export interface DiagnosisResult {
  readonly rawData: string
  readonly parsedValues: LiveData
  readonly dtcCodes: DtcCode[]
  readonly diagnosisText: string
  readonly severity: Severity
}
