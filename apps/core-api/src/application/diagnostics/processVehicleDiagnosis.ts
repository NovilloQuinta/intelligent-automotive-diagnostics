import type { ObdRepository } from '@/application/ports/obdRepository.interface.js'
import type { DiagnosisResult, Severity } from '@/domain/entities/diagnosisResult.js'

function computeSeverity(dtcCount: number): Severity {
  if (dtcCount === 0) return 'low'
  return 'critical'
}

function buildDiagnosisText(description: string, severity: Severity): string {
  return `[${severity.toUpperCase()}] ${description}`
}

/** Orquesta lectura de telemetría y devuelve un diagnóstico determinista. */
export async function processVehicleDiagnosis(repo: ObdRepository): Promise<DiagnosisResult> {
  const [parsedValues, dtcCodes] = await Promise.all([repo.readLiveData(), repo.readDtcCodes()])

  const severity = computeSeverity(dtcCodes.length)

  const description =
    dtcCodes.length > 0 ? dtcCodes.map((d) => d.code).join(', ') : 'No fault codes detected'

  const diagnosisText = buildDiagnosisText(description, severity)
  const rawData = JSON.stringify(parsedValues)

  return { rawData, parsedValues, dtcCodes, diagnosisText, severity }
}
