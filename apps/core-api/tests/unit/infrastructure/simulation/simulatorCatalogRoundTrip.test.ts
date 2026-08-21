import { describe, it, expect } from 'vitest'
import { ObdSimulator } from '@/infrastructure/simulation/simulator.js'
import type { SimulationScenario } from '@/infrastructure/simulation/scenario.js'
import { VehicleType } from '@/infrastructure/simulation/scenario.js'
import { Vin } from '@/domain/value-objects/Vin.js'
import { ALL_SEED_PIDS } from '@/domain/catalogs/pidCatalog.js'
import { evaluatePid } from '@/domain/services/pidFormula.js'
import { MODE_CURRENT_DATA } from '@/domain/pids.js'

/**
 * El simulador reimplementa a mano la codificacion **inversa** de SAE J1979
 * (`RPM_SCALE`, `TEMP_OFFSET`, `PERCENT_SCALE`...), mientras que la decodificacion
 * vive en las formulas del catalogo de dominio. Son el mismo conocimiento escrito
 * dos veces y en sentidos opuestos: si una formula del catalogo cambia y el
 * simulador no, el emulador empieza a mentir en silencio y ningun test lo nota.
 *
 * Estos tests atan las dos mitades sin refactorizar ninguna: recorren el catalogo
 * y comprueban que codificar y volver a decodificar devuelve el punto de partida.
 */

/** Bytes de partida de la ida y vuelta, deterministas y dentro de rango para todo PID. */
function sampleBytes(dataBytes: number): number[] {
  return dataBytes === 1 ? [0x64] : [0x12, 0x34]
}

/** Escenario minimo cuyo unico contenido relevante es el valor fisico bajo prueba. */
function scenarioWith(pidKey: string, value: number): SimulationScenario {
  return {
    id: 'round-trip',
    name: 'Round-trip catalogo ↔ simulador',
    vehicleType: VehicleType.Car,
    sensorValues: { rpm: 0, coolantTemp: 0, speed: 0, intakeTemp: 0 },
    dtcConfig: [],
    vehicleInfo: {
      make: 'Test',
      model: 'Test',
      year: 2020,
      engineType: 'Test',
      vin: new Vin('WUAZZZ8V0KA123456'),
    },
    pidValues: { [pidKey]: value },
  }
}

const mode01Pids = ALL_SEED_PIDS.filter((pid) => pid.pidCode.mode === MODE_CURRENT_DATA)

describe('ObdSimulator round-trip against the domain PID catalog', () => {
  it('should model every Mode 01 PID the catalog defines', () => {
    expect(mode01Pids.length).toBeGreaterThan(0)

    const unmodelled = mode01Pids
      .filter((pid) => {
        const simulator = new ObdSimulator(scenarioWith(pid.pidCode.key, 0))
        try {
          simulator.readPidRawBytes(MODE_CURRENT_DATA, pid.pidCode.pid)
          return false
        } catch {
          return true
        }
      })
      .map((pid) => pid.pidCode.key)

    expect(unmodelled).toEqual([])
  })

  it.each(mode01Pids.map((pid) => [pid.pidCode.key, pid] as const))(
    'should re-encode %s back to the bytes its catalog formula was decoded from',
    (_key, pid) => {
      const originalBytes = sampleBytes(pid.dataBytes)
      const physicalValue = evaluatePid(pid.formula.toString(), originalBytes)

      const simulator = new ObdSimulator(scenarioWith(pid.pidCode.key, physicalValue))
      const encodedBytes = simulator.readPidRawBytes(MODE_CURRENT_DATA, pid.pidCode.pid)

      expect(encodedBytes).toEqual(originalBytes)
    },
  )
})
