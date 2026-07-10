import type { LiveData } from '@/domain/entities/liveData.js'
import type { DtcCode } from '@/domain/entities/dtcCode.js'

/** Tipo de vehículo soportado por la simulación. */
export type VehicleType = 'car' | 'motorcycle'

/** Configuración estática de un escenario de simulación de telemetría. */
export interface SimulationScenario {
  readonly id: string
  readonly name: string
  readonly vehicleType: VehicleType
  /** Valores de sensores que devolverá el simulador para este escenario. */
  readonly sensorValues: LiveData
  /** Códigos DTC que devolverá el simulador para este escenario. */
  readonly dtcConfig: DtcCode[]
}
