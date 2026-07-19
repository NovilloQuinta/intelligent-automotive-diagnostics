import type { ObdRepository } from '@/application/ports/obdRepository.interface.js'
import type { DiagnosisResult, Severity } from '@/domain/entities/diagnosisResult.js'
import type { FreezeFrame } from '@/domain/entities/freezeFrame.js'

function computeSeverity(dtcCount: number, freezeFrame: FreezeFrame | null): Severity {
  if (dtcCount === 0) return 'low'
  if (freezeFrame) return 'critical'
  return 'high'
}

function buildDiagnosisText(
  description: string,
  severity: Severity,
  freezeFrame: FreezeFrame | null,
): string {
  const base = `[${severity.toUpperCase()}] ${description}`
  if (freezeFrame) {
    const freezeKeys = Object.keys(freezeFrame.pidValues).join(', ')
    return `${base} (freeze frame: ${freezeFrame.dtcCode} → ${freezeKeys})`
  }
  return base
}

const DIAGNOSIS_TIMEOUT_MS = 10_000

/**
 * Orquesta lectura de telemetría y devuelve un diagnóstico determinista.
 * Lee RPM, coolant temp, speed, intake temp como PIDs individuales vía readPid(),
 * consulta DTCs y freeze frame, y calcula severidad.
 * Si la lectura excede {@link DIAGNOSIS_TIMEOUT_MS}, lanza un error con timeout.
 */
export async function processVehicleDiagnosis(repo: ObdRepository): Promise<DiagnosisResult> {
  const results = await Promise.race([
    Promise.all([
      repo.readPid('01', '0C'),
      repo.readPid('01', '05'),
      repo.readPid('01', '0D'),
      repo.readPid('01', '0F'),
      repo.readDtcCodes(),
      repo.getFreezeFrame(),
    ]),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error('Diagnosis timed out after 10 seconds')),
        DIAGNOSIS_TIMEOUT_MS,
      ),
    ),
  ])

  const [rpm, coolantTemp, speed, intakeTemp, dtcCodes, freezeFrame] = results

  const parsedValues = { rpm, coolantTemp, speed, intakeTemp }
  const severity = computeSeverity(dtcCodes.length, freezeFrame)

  const description =
    dtcCodes.length > 0 ? dtcCodes.map((d) => d.code).join(', ') : 'No fault codes detected'

  const diagnosisText = buildDiagnosisText(description, severity, freezeFrame)
  const rawData = JSON.stringify(parsedValues)

  return { rawData, parsedValues, dtcCodes, diagnosisText, severity }
}
