import type { ObdRepositoryPort } from '@/application/ports/obdRepository.port.js'
import { DtcCode } from '@/domain/value-objects/dtcCode.js'
import type { FreezeFrame } from '@/domain/value-objects/freezeFrame.js'
import type { VehicleInfo } from '@/domain/value-objects/vehicleInfo.js'
import type { ObdSimulator } from './simulator.js'

/** Adaptador que implementa {@link ObdRepositoryPort} usando el simulador de hardware. */
export class ObdSimulatorRepository implements ObdRepositoryPort {
  constructor(private readonly simulator: ObdSimulator) {}

  async readPid(mode: string, pid: string): Promise<number> {
    return this.simulator.readPidValue(mode, pid)
  }

  async getSupportedPids(): Promise<string[]> {
    return this.simulator.getSupportedPids()
  }

  async getFreezeFrame(dtc?: string): Promise<FreezeFrame | null> {
    return this.simulator.getFreezeFrame(dtc)
  }

  async readDtcCodes(): Promise<DtcCode[]> {
    return this.simulator.getRawDtcs().map((code: string) => new DtcCode({ code }))
  }

  async clearDtcCodes(): Promise<void> {
    // No-op en simulación: los DTCs se gestionan vía el escenario activo
  }

  async readVin(): Promise<string> {
    return this.simulator.getVin()
  }

  async getVehicleInfo(): Promise<VehicleInfo> {
    return this.simulator.getVehicleInfo()
  }

  async setPower(_on: boolean): Promise<void> {
    // No-op en simulación
  }
}
