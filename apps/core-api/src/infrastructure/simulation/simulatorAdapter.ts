import type { ObdRepository, PidReadResult } from '@/application/ports/ObdRepository.js'
import { DtcCode } from '@/domain/value-objects/DtcCode.js'
import type { EcuInfo } from '@/domain/entities/EcuInfo.js'
import type { FreezeFrame } from '@/domain/value-objects/FreezeFrame.js'
import type { VehicleInfo } from '@/domain/value-objects/VehicleInfo.js'
import type { VehicleStatus } from '@/domain/value-objects/VehicleStatus.js'
import type { ObdSimulator } from './simulator.js'

/** Adaptador que implementa {@link ObdRepository} usando el simulador de hardware. */
export class ObdSimulatorRepository implements ObdRepository {
  constructor(private readonly simulator: ObdSimulator) {}

  async readPid(mode: string, pid: string): Promise<number> {
    return this.simulator.readPidValue(mode, pid)
  }

  async readPidWithBytes(mode: string, pid: string): Promise<PidReadResult> {
    return {
      value: this.simulator.readPidValue(mode, pid),
      bytes: this.simulator.readPidRawBytes(mode, pid),
    }
  }

  /**
   * Lee varios PIDs simulados con degradación por PID: un PID que el escenario no
   * soporta lanza y se omite del Map, el resto mantiene sus valores.
   */
  async readPids(mode: string, pids: readonly string[]): Promise<Map<string, number>> {
    const result = new Map<string, number>()
    for (const pid of pids) {
      try {
        result.set(pid, this.simulator.readPidValue(mode, pid))
      } catch {
        // PID no soportado por el escenario: se omite
      }
    }
    return result
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

  async readPendingDtcCodes(): Promise<DtcCode[]> {
    return this.simulator.getRawDtcs().map((code: string) => new DtcCode({ code }))
  }

  async readPermanentDtcCodes(): Promise<DtcCode[]> {
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

  async getVehicleStatus(): Promise<VehicleStatus> {
    return this.simulator.getVehicleStatus()
  }

  async setPower(_on: boolean): Promise<void> {
    // No-op en simulación
  }
}
