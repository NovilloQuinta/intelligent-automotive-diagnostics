import { VehicleType } from '@/infrastructure/simulation/scenario.js'
import type { SimulationScenario } from '@/infrastructure/simulation/scenario.js'
import { EcuInfo } from '@/domain/entities/ecuInfo.js'
import { Vin } from '@/domain/value-objects/vin.js'
import { LiveData } from '@/domain/value-objects/liveData.js'

const audiIdleData = new LiveData({ rpm: 750, coolantTemp: 90, speed: 0, intakeTemp: 25 })
const kawaData = new LiveData({ rpm: 4500, coolantTemp: 105, speed: 0, intakeTemp: 28 })

const CAN_PROTOCOL = 'ISO 15765-4 (CAN 11/500)'
const UNASSIGNED_VEHICLE_ID = 0

function createEcu(
  id: number,
  name: string,
  type: string,
  requestAddr: string,
  responseAddr: string,
): EcuInfo {
  return new EcuInfo({
    id,
    vehicleId: UNASSIGNED_VEHICLE_ID,
    name,
    requestAddr,
    responseAddr,
    type,
    protocol: CAN_PROTOCOL,
  })
}

const ECM = createEcu(1, 'Engine Control Module', 'ECM', '7E0', '7E8')
const TCM = createEcu(2, 'Transmission Control Module', 'TCM', '7E1', '7E9')
const ABS = createEcu(3, 'ABS Control Module', 'ABS', '760', '768')
const BCM = createEcu(4, 'Body Control Module', 'BCM', '7C0', '7C8')
const SRS = createEcu(5, 'Airbag Control Module', 'SRS', '7D2', '7DA')
const IPC = createEcu(6, 'Instrument Panel Cluster', 'IPC', '720', '728')

/** Escenarios de simulacion de ejemplo para desarrollo y tests. */
export const seedScenarios: SimulationScenario[] = [
  {
    id: 'audi-a3-idle',
    name: 'Audi A3 al ralentí',
    vehicleType: VehicleType.Car,
    sensorValues: audiIdleData,
    dtcConfig: [{ code: 'P0301', description: 'Cylinder 1 Misfire' }],
    ecus: [ECM, TCM, ABS, BCM, SRS],
    vehicleInfo: {
      make: 'Audi',
      model: 'A3',
      year: 2018,
      engineType: '2.0 TFSI',
      vin: new Vin('WAUZZZ8V5JA123456'),
    },
  },
  {
    id: 'kawa-z900',
    name: 'Kawasaki Z900',
    vehicleType: VehicleType.Motorcycle,
    sensorValues: kawaData,
    dtcConfig: [],
    ecus: [ECM, ABS, IPC],
    vehicleInfo: {
      make: 'Kawasaki',
      model: 'Z900',
      year: 2020,
      engineType: '948cc Inline-4',
      vin: new Vin('JKAZR2A1XLA000111'),
    },
  },
]
