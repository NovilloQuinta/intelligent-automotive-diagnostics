import type { ObdRepository } from '@/application/ports/ObdRepository.js'
import { DtcCode } from '@/domain/value-objects/dtcCode.js'
import type { EcuInfo } from '@/domain/entities/ecuInfo.js'
import type { FreezeFrame } from '@/domain/value-objects/freezeFrame.js'
import type { VehicleInfo } from '@/domain/value-objects/vehicleInfo.js'
import type { ObdSimulator } from './simulator.js'

/** Adaptador que implementa {@link ObdRepository} usando el simulador de hardware. */
export class ObdSimulatorRepository implements ObdRepository {
  constructor(private readonly simulator: ObdSimulator) {}

  async readPid(mode: string, pid: string): Promise<number> {
    return this.simulator.readPidValue(mode, pid)
  }

  /**
   * El escenario define la codificacion de cada sensor que modela, asi que `dataBytes` no
   * interviene: no hay una trama real que recortar.
   */
  async readPidRaw(mode: string, pid: string, _dataBytes: number): Promise<number[]> {
    return this.simulator.readPidRawBytes(mode, pid)
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

  async getEcuInfo(): Promise<EcuInfo[]> {
    return this.simulator.getEcus()
  }

  async setPower(_on: boolean): Promise<void> {
    // No-op en simulación
  }
}
