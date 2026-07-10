import type { LiveData } from './liveData.js'
import type { DtcCode } from './dtcCode.js'

export type VehicleType = 'car' | 'motorcycle'

export interface SimulationScenario {
  readonly id: string
  readonly name: string
  readonly vehicleType: VehicleType
  readonly sensorValues: LiveData
  readonly dtcConfig: DtcCode[]
}
