import type { ObdRepository } from '@/application/ports/obdRepository.interface.js'
import type { LiveData } from '@/domain/entities/liveData.js'
import type { DtcCode } from '@/domain/entities/dtcCode.js'
import type { ObdSimulator } from './obdSimulator.js'
import { parseAllPids } from '@/infrastructure/math-parsers/hexParser.js'

/** Adaptador que implementa {@link ObdRepository} usando el simulador de hardware. */
export class ObdSimulatorRepository implements ObdRepository {
  constructor(private readonly simulator: ObdSimulator) {}

  async readLiveData(): Promise<LiveData> {
    const hex = this.simulator.getRawTelemetry()
    return parseAllPids(hex)
  }

  async readDtcCodes(): Promise<DtcCode[]> {
    return this.simulator.getRawDtcs().map((code) => ({
      code,
      description: '',
    }))
  }

  async setPower(_on: boolean): Promise<void> {
    // No-op en simulación
  }
}
