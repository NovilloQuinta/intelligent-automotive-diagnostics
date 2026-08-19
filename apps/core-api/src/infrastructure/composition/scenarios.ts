import type { AppConfig } from '@/infrastructure/configuration/index.js'
import { VehicleInfo } from '@/domain/value-objects/vehicleInfo.js'
import { Vin } from '@/domain/value-objects/vin.js'
import type { ScenarioDescriptor } from '@/infrastructure/services/diagnosisTypes.js'

/**
 * Catalogo de los vehiculos emulados que sirve el modo docker.
 *
 * Son datos, no cableado: identificacion del vehiculo mas el host y puerto de su
 * emulador. Quien los convierte en repositorios OBD es `composition/diagnosis.ts`.
 */

/**
 * Toyota Auris Hybrid, sobre el escenario `car` integrado del emulador.
 *
 * La telemetria (PIDs 05, 0C, 0D, 0F) y los codigos de averia se leen en tiempo real
 * del emulador via `GET /api/live-data` y `GET /api/dtc-codes`. No se hardcodean
 * valores que el emulador ya provee.
 */
function toyotaScenario(config: AppConfig): ScenarioDescriptor {
  return {
    id: 'toyota',
    name: 'Toyota (Built-in)',
    vehicleType: 'car',
    connectionType: 'wifi',
    dtcConfig: [],
    vehicleInfo: new VehicleInfo({
      make: 'Toyota',
      model: 'Auris Hybrid',
      year: 2016,
      engineType: '1.8L Hybrid',
      vin: new Vin('JTDKN3DU60A123456'),
    }),
    host: config.ELM327_TOYOTA_HOST,
    port: config.ELM327_TOYOTA_PORT,
  }
}

/** Audi A3 2.0 TDI, el escenario propio con las tres averias del diesel. */
function audiScenario(config: AppConfig): ScenarioDescriptor {
  return {
    id: 'audi-a3-tdi',
    name: 'Audi A3 2.0 TDI',
    vehicleType: 'car',
    connectionType: 'wifi',
    vehicleInfo: new VehicleInfo({
      make: 'Audi',
      model: 'A3',
      year: 2018,
      engineType: '2.0 TDI',
      vin: new Vin('WAUZZZ8V5JA123456'),
    }),
    host: config.ELM327_AUDI_HOST,
    port: config.ELM327_AUDI_PORT,
  }
}

/** Kawasaki Z900: el unico vehiculo de dos ruedas del catalogo. */
function kawasakiScenario(config: AppConfig): ScenarioDescriptor {
  return {
    id: 'kawasaki-z900',
    name: 'Kawasaki Z900',
    vehicleType: 'motorcycle',
    connectionType: 'wifi',
    dtcConfig: [],
    vehicleInfo: new VehicleInfo({
      make: 'Kawasaki',
      model: 'Z900',
      year: 2020,
      engineType: '948cc Inline-4',
      vin: new Vin('JKAZR2A1XLA000111'),
    }),
    host: config.ELM327_KAWASAKI_HOST,
    port: config.ELM327_KAWASAKI_PORT,
  }
}

/** Los tres vehiculos emulados, en el orden en que los lista la UI. */
export function createDockerScenarios(config: AppConfig): ScenarioDescriptor[] {
  return [toyotaScenario(config), audiScenario(config), kawasakiScenario(config)]
}
