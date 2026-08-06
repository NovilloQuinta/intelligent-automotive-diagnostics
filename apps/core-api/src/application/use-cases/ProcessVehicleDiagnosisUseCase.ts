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

// Re-export para compatibilidad hacia atras — los consumidores deben migrar
// gradualmente a @/application/shared/withTimeout.js.
export { DIAGNOSIS_TIMEOUT_MS, withTimeout } from '@/application/shared/withTimeout.js'

/**
 * Caso de uso: diagnostico determinista via OBD-II.
 * Lee las 6 magnitudes de forma secuencial para respetar la conexion TCP
 * compartida del transporte ELM327 (la cola del transporte serializa igualmente).
 */
export class ProcessVehicleDiagnosisUseCase {
  constructor(private readonly repo: ObdRepository) {}

  /**
   * Ejecuta el diagnostico completo: 4 lecturas de PID (RPM, temperatura
   * refrigerante, velocidad, temperatura admision) + codigos DTC + freeze frame.
   * @returns DiagnosisResult con la live data parseada, los DTCs y el freeze frame
   * @throws Error — si alguna lectura falla (timeout de comando o caida de la
   *   conexion; el transporte rechaza con Elm327ConnectionError)
   */
  async execute(): Promise<DiagnosisResult> {
    // Lecturas secuenciales sobre la conexion compartida: el transporte TCP ya
    // serializa los comandos, por lo que el diagnostico se ejecuta comando a comando.
    const rpm = await this.repo.readPid(MODE_CURRENT_DATA, PID_RPM)
    const coolantTemp = await this.repo.readPid(MODE_CURRENT_DATA, PID_COOLANT_TEMP)
    const speed = await this.repo.readPid(MODE_CURRENT_DATA, PID_SPEED)
    const intakeTemp = await this.repo.readPid(MODE_CURRENT_DATA, PID_INTAKE_TEMP)
    const dtcCodes = await this.repo.readDtcCodes()
    const freezeFrame = await this.repo.getFreezeFrame()

    const parsedValues = new LiveData({ rpm, coolantTemp, speed, intakeTemp })
    return new DiagnosisResult({ parsedValues, dtcCodes, freezeFrame })
  }
}
