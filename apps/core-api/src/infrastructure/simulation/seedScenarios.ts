import { VehicleType } from '@/infrastructure/simulation/scenario.js'
import type { SimulationScenario } from '@/infrastructure/simulation/scenario.js'
import { EcuInfo } from '@/domain/entities/ecuInfo.js'
import { Vin } from '@/domain/value-objects/vin.js'
import { LiveData } from '@/domain/value-objects/liveData.js'
import {
  MODE_CURRENT_DATA,
  PID_CONTROL_MODULE_VOLTAGE,
  PID_ENGINE_LOAD,
  PID_THROTTLE_POSITION,
} from '@/domain/pids.js'

const audiIdleData = new LiveData({ rpm: 750, coolantTemp: 90, speed: 0, intakeTemp: 25 })
const kawaData = new LiveData({ rpm: 4500, coolantTemp: 105, speed: 0, intakeTemp: 28 })

const CAN_PROTOCOL = 'ISO 15765-4 (CAN 11/500)'
const UNASSIGNED_VEHICLE_ID = 0

function createEcu(params: {
  id: number
  name: string
  type: string
  requestAddr: string
  responseAddr: string
}): EcuInfo {
  return new EcuInfo({
    id: params.id,
    vehicleId: UNASSIGNED_VEHICLE_ID,
    name: params.name,
    requestAddr: params.requestAddr,
    responseAddr: params.responseAddr,
    type: params.type,
    protocol: CAN_PROTOCOL,
  })
}

const THROTTLE_KEY = `${MODE_CURRENT_DATA} ${PID_THROTTLE_POSITION}`
const ENGINE_LOAD_KEY = `${MODE_CURRENT_DATA} ${PID_ENGINE_LOAD}`
const CONTROL_MODULE_VOLTAGE_KEY = `${MODE_CURRENT_DATA} ${PID_CONTROL_MODULE_VOLTAGE}`

/** Lecturas extra del Audi al ralenti: acelerador suelto, carga baja y bateria sana. */
const audiPidValues: Record<string, number> = {
  [THROTTLE_KEY]: 14,
  [ENGINE_LOAD_KEY]: 18,
  [CONTROL_MODULE_VOLTAGE_KEY]: 14.2,
}

/** Lecturas extra de la Kawasaki: acelerado y con voltaje de modulo bajo (fallo de carga). */
const kawaPidValues: Record<string, number> = {
  [THROTTLE_KEY]: 52,
  [ENGINE_LOAD_KEY]: 58,
  [CONTROL_MODULE_VOLTAGE_KEY]: 10.9,
}

const ECM = createEcu({ id: 1, name: 'Engine Control Module', type: 'ECM', requestAddr: '7E0', responseAddr: '7E8' })
const TCM = createEcu({ id: 2, name: 'Transmission Control Module', type: 'TCM', requestAddr: '7E1', responseAddr: '7E9' })
const ABS = createEcu({ id: 3, name: 'ABS Control Module', type: 'ABS', requestAddr: '760', responseAddr: '768' })
const BCM = createEcu({ id: 4, name: 'Body Control Module', type: 'BCM', requestAddr: '7C0', responseAddr: '7C8' })
const SRS = createEcu({ id: 5, name: 'Airbag Control Module', type: 'SRS', requestAddr: '7D2', responseAddr: '7DA' })
const IPC = createEcu({ id: 6, name: 'Instrument Panel Cluster', type: 'IPC', requestAddr: '720', responseAddr: '728' })

/** Escenarios de simulacion de ejemplo para desarrollo y tests. */
export const seedScenarios: SimulationScenario[] = [
  {
    id: 'audi-a3-idle',
    name: 'Audi A3 al ralentí',
    vehicleType: VehicleType.Car,
    sensorValues: audiIdleData,
    dtcConfig: [{ code: 'P0301', description: 'Cylinder 1 Misfire' }],
    pidValues: audiPidValues,
    ecus: [ECM, TCM, ABS, BCM, SRS],
    vehicleInfo: {
      make: 'Audi',
      model: 'A3',
      year: 2018,
      engineType: '2.0 TFSI',
      vin: new Vin('WAUZZZ8V5JA123456'),
      vinStatus: 'read' as const,
    },
  },
  {
    id: 'kawa-z900',
    name: 'Kawasaki Z900',
    vehicleType: VehicleType.Motorcycle,
    sensorValues: kawaData,
    dtcConfig: [],
    pidValues: kawaPidValues,
    ecus: [ECM, ABS, IPC],
    vehicleInfo: {
      make: 'Kawasaki',
      model: 'Z900',
      year: 2020,
      engineType: '948cc Inline-4',
      vin: new Vin('JKAZR2A1XLA000111'),
      vinStatus: 'read' as const,
    },
  },
]
