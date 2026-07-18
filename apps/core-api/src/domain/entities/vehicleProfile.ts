import type { EcuInfo } from './ecuInfo.js'
import type { PidDefinition } from './pidDefinition.js'

/** Perfil completo de un vehículo: identificación + ECUs + PIDs conocidos. */
export interface VehicleProfile {
  readonly id?: number
  readonly vin: string
  readonly make: string
  readonly model: string
  readonly year: number
  readonly engineType: string
  readonly firstSeen?: string
  readonly lastSeen?: string
  readonly ecus?: readonly EcuInfo[]
  readonly pids?: readonly PidDefinition[]
}

/** Sesión de diagnóstico asociada a un vehículo. */
export interface DiagnosisSession {
  readonly id?: number
  readonly vehicleId: number
  readonly scenarioId?: string
  readonly startedAt?: string
  readonly endedAt?: string
}
