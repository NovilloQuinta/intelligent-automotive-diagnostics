import type { DtcCode } from '@/domain/value-objects/dtcCode.js'
import type { EcuInfo } from '@/domain/entities/ecuInfo.js'
import type { FreezeFrame } from '@/domain/value-objects/freezeFrame.js'
import type { VehicleInfo } from '@/domain/value-objects/vehicleInfo.js'

/** Contrato para la adquisición de datos OBD-II desde el hardware. */
export interface ObdRepository {
  /** Service 01 — Lee un PID OBD-II genérico por modo y código.
   * @param mode — Modo OBD (01, 02, 09, 22, ...)
   * @param pid — Código del PID (0C, 05, 0300, ...)
   * @returns Valor físico del PID (tras aplicar la fórmula)
   */
  readPid(mode: string, pid: string): Promise<number>

  /** Service 01 PID 00/20/40/60 — Devuelve los PIDs soportados como bitmask. */
  getSupportedPids(): Promise<string[]>

  /** Service 02 — Datos congelados del momento en que se disparó un DTC.
   * @param dtc — Código DTC opcional. Si no se especifica, devuelve el último.
   * @returns FreezeFrame o null si no hay snapshot disponible
   */
  getFreezeFrame(dtc?: string): Promise<FreezeFrame | null>

  /** Service 03 — Lee códigos de fallo activos. */
  readDtcCodes(): Promise<DtcCode[]>

  /** Service 04 — Borra los DTCs y valores almacenados. */
  clearDtcCodes(): Promise<void>

  /** Service 09 PID 02 — Lee el VIN del vehículo. */
  readVin(): Promise<string>

  /** Información estática del vehículo conectado (marca, modelo, año, tipo motor). */
  getVehicleInfo(): Promise<VehicleInfo>

  /** Devuelve las ECUs descubiertas en el bus CAN/OBD del vehiculo conectado. */
  getEcuInfo(): Promise<EcuInfo[]>

  /** Activa/desactiva la alimentación del adaptador OBD. */
  setPower(on: boolean): Promise<void>
}
