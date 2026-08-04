import type { ObdRepository } from '@/application/ports/ObdRepository.js'
import { DiagnosisResult } from '@/domain/value-objects/diagnosisResult.js'
import { LiveData } from '@/domain/value-objects/liveData.js'
import {
  MODE_CURRENT_DATA,
  PID_RPM,
  PID_COOLANT_TEMP,
  PID_SPEED,
  PID_INTAKE_TEMP,
} from '@/domain/pids.js'

/** Timeout para lecturas OBD individuales (ms). Compartido con MCP tool calls. */
export const DIAGNOSIS_TIMEOUT_MS = 10_000

/**
 * Envuelve una promesa con un timeout. Suprime late rejection de la rama
 * perdedora para evitar {@link https://nodejs.org/api/process.html#event-unhandledrejection|unhandledRejection}.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string,
): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(errorMessage)), timeoutMs),
  )

  return Promise.race([promise, timeout]).finally(() => {
    promise.catch(() => {})
  })
}

/** Caso de uso: diagnostico determinista via OBD-II. */
export class ProcessVehicleDiagnosisUseCase {
  constructor(private readonly repo: ObdRepository) {}

  async execute(): Promise<DiagnosisResult> {
    const [rpm, coolantTemp, speed, intakeTemp, dtcCodes, freezeFrame] =
      await withTimeout(
        Promise.all([
          this.repo.readPid(MODE_CURRENT_DATA, PID_RPM),
          this.repo.readPid(MODE_CURRENT_DATA, PID_COOLANT_TEMP),
          this.repo.readPid(MODE_CURRENT_DATA, PID_SPEED),
          this.repo.readPid(MODE_CURRENT_DATA, PID_INTAKE_TEMP),
          this.repo.readDtcCodes(),
          this.repo.getFreezeFrame(),
        ]),
        DIAGNOSIS_TIMEOUT_MS,
        `Diagnosis timed out after ${DIAGNOSIS_TIMEOUT_MS}ms`,
      )

    const parsedValues = new LiveData({ rpm, coolantTemp, speed, intakeTemp })
    return new DiagnosisResult({ parsedValues, dtcCodes, freezeFrame })
  }
}
