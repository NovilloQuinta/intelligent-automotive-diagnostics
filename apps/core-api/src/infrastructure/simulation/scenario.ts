import type { LiveData } from '@/domain/value-objects/liveData.js'
import type { DtcCode } from '@/domain/value-objects/dtcCode.js'
import type { EcuInfo } from '@/domain/entities/ecuInfo.js'
import type { VehicleInfo } from '@/domain/value-objects/vehicleInfo.js'
import type { FreezeFrame } from '@/domain/value-objects/freezeFrame.js'

/** Tipo de vehiculo soportado por la simulacion. */
export enum VehicleType {
  Car = 'car',
  Motorcycle = 'motorcycle',
}

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
  /** Unidades de control descubiertas en el bus CAN (opcional). */
  readonly ecus?: EcuInfo[]
}
