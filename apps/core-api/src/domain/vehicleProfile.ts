import type { EcuInfo } from './ecuInfo.js'
import type { PidDefinition } from './pidDefinition.js'

/** Datos de identificacion estatica del vehiculo bajo diagnostico. */
export interface VehicleInfo {
  readonly make: string
  readonly model: string
  readonly year: number
  readonly engineType: string
  readonly vin: string
}

/** Perfil completo de un vehiculo: identificacion + ECUs + PIDs conocidos. */
export interface VehicleProfile extends VehicleInfo {
  readonly id?: number
  readonly firstSeen?: string
  readonly lastSeen?: string
  readonly ecus?: readonly EcuInfo[]
  readonly pids?: readonly PidDefinition[]
}
