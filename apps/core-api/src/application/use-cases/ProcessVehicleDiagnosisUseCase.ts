import type { ObdRepository } from '@/application/ports/ObdRepository.js'
import { DiagnosisResult } from '@/domain/value-objects/DiagnosisResult.js'
import { LiveData } from '@/domain/value-objects/LiveData.js'
import {
  MODE_CURRENT_DATA,
  PID_RPM,
  PID_COOLANT_TEMP,
  PID_SPEED,
  PID_INTAKE_TEMP,
} from '@/domain/pids.js'

/** @deprecated Usar `@/application/shared/withTimeout.js` directamente. */
export { DIAGNOSIS_TIMEOUT_MS, withTimeout } from '@/application/shared/withTimeout.js'

/**
 * Diagnostico determinista via OBD-II con lecturas secuenciales.
 *
 * Antes se usaba `Promise.all` con 6 lecturas en paralelo, generando 6 sockets
 * TCP efimeros. Ahora las lecturas son secuenciales porque el transporte
 * ELM327 reutiliza una unica conexion TCP persistente con cola FIFO interna.
 */
export class ProcessVehicleDiagnosisUseCase {
  constructor(private readonly repo: ObdRepository) {}

  /**
   * @returns Diagnostico con live data, DTCs y freeze frame
   * @throws Elm327ConnectionError — si falla la conexion o el timeout de comando
   */
  async execute(): Promise<DiagnosisResult> {
    const rpm = await this.repo.readPid(MODE_CURRENT_DATA, PID_RPM)
    const coolantTemp = await this.repo.readPid(MODE_CURRENT_DATA, PID_COOLANT_TEMP)
    const speed = await this.repo.readPid(MODE_CURRENT_DATA, PID_SPEED)
    const intakeTemp = await this.repo.readPid(MODE_CURRENT_DATA, PID_INTAKE_TEMP)
    const dtcCodes = await this.repo.readDtcCodes()
    const freezeFrame = await this.repo.getFreezeFrame(dtcCodes[0]?.code)

    const parsedValues = new LiveData({ rpm, coolantTemp, speed, intakeTemp })
    return new DiagnosisResult({ parsedValues, dtcCodes, freezeFrame })
  }
}
