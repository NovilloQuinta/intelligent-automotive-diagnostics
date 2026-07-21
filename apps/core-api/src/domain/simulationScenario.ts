import type { LiveData } from './liveData.js'
import type { DtcCode } from './dtcCode.js'
import type { VehicleInfo } from './vehicleProfile.js'
import type { FreezeFrame } from './freezeFrame.js'

/** Tipo de vehiculo soportado por la simulacion. */
export type VehicleType = 'car' | 'motorcycle'

/** Configuracion estatica de un escenario de simulacion de telemetria. */
export interface SimulationScenario {
  readonly id: string
  readonly name: string
  readonly vehicleType: VehicleType
  /** Valores de sensores que devolvera el simulador para este escenario. */
  readonly sensorValues: LiveData
  /** Codigos DTC que devolvera el simulador para este escenario. */
  readonly dtcConfig: DtcCode[]
  /** Informacion del vehiculo simulado. */
  readonly vehicleInfo: VehicleInfo
  /** Mapa de mode+pid a valor fisico para simular lecturas de PIDs arbitrarios. */
  readonly pidValues?: Record<string, number>
  /** Datos de freeze frame simulados (opcional). */
  readonly freezeFrame?: FreezeFrame
}
