import type { VehicleInfo } from '@/domain/value-objects/vehicleInfo.js'

/** Input del caso de uso de diagnostico cognitivo (solo datos). */
export interface ExecuteCognitiveDiagnosisInput {
  readonly userQuery?: string
  readonly vehicleContext?: VehicleInfo
}
