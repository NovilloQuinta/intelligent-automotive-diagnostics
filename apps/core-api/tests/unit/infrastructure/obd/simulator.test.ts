import { describe, it, expect } from 'vitest'
import { ObdSimulator } from '@/infrastructure/obd/simulator.js'
import { Vin } from '@/domain/vin.js'
import type { SimulationScenario } from '@/domain/simulationScenario.js'
import type { LiveData } from '@/domain/liveData.js'
import type { FreezeFrame } from '@/domain/freezeFrame.js'

const audiIdleSensorValues: LiveData = {
  rpm: 750,
  coolantTemp: 90,
  speed: 0,
  intakeTemp: 25,
}

const audiIdleScenario: SimulationScenario = {
  id: 'audi-a3-idle',
  name: 'Audi A3 al ralenti',
  vehicleType: 'car',
  sensorValues: audiIdleSensorValues,
  dtcConfig: [{ code: 'P0301', description: 'Cylinder 1 Misfire' }],
  vehicleInfo: {
    make: 'Audi',
    model: 'A3',
    year: 2018,
    engineType: '2.0 TFSI',
    vin: Vin.create('WUAZZZ8V0KA123456'),
  },
}

describe('ObdSimulator', () => {
  it('should return a 10-char hex frame from getRawTelemetry', () => {
    const simulator = new ObdSimulator(audiIdleScenario)

    const frame = simulator.getRawTelemetry()

    expect(frame).toHaveLength(10)
    expect(frame).toMatch(/^[0-9A-F]+$/)
  })

  it('should encode RPM using SAE J1979 formula (A * 256 + B) / 4', () => {
    const simulator = new ObdSimulator(audiIdleScenario)

    const frame = simulator.getRawTelemetry()
    const rpmHex = frame.slice(0, 4)
    const expectedRpmHex = '0BB8'

    expect(rpmHex).toBe(expectedRpmHex)
  })

  it('should encode coolant temperature as raw + 40', () => {
    const simulator = new ObdSimulator(audiIdleScenario)

    const frame = simulator.getRawTelemetry()
    const coolantHex = frame.slice(4, 6)

    expect(coolantHex).toBe('82')
  })

  it('should encode speed directly as hex byte', () => {
    const simulator = new ObdSimulator({
      ...audiIdleScenario,
      sensorValues: { ...audiIdleSensorValues, speed: 120 },
    })

    const frame = simulator.getRawTelemetry()
    const speedHex = frame.slice(6, 8)

    expect(speedHex).toBe('78')
  })

  it('should return DTC hex codes from getRawDtcs', () => {
    const simulator = new ObdSimulator(audiIdleScenario)

    const dtcFrames = simulator.getRawDtcs()

    expect(dtcFrames).toHaveLength(1)
    expect(dtcFrames[0]).toBe('P0301')
  })

  it('should switch scenarios and return updated telemetry', () => {
    const simulator = new ObdSimulator(audiIdleScenario)
    const kawaData: LiveData = { rpm: 4500, coolantTemp: 105, speed: 0, intakeTemp: 28 }
    const kawaScenario: SimulationScenario = {
      id: 'kawa-z900-hot',
      name: 'Kawasaki Z900 en caliente',
      vehicleType: 'motorcycle',
      sensorValues: kawaData,
      dtcConfig: [],
      vehicleInfo: {
        vin: Vin.create('JKAKZ900H8A123456'),
        make: 'Kawasaki',
        model: 'Z900',
        year: 2020,
        engineType: '948cc Inline-4',
      },
    }

    simulator.setScenario(kawaScenario)
    const frame = simulator.getRawTelemetry()
    const rpmHex = frame.slice(0, 4)

    expect(rpmHex).toBe('4650')
    expect(simulator.getRawDtcs()).toHaveLength(0)
  })

  it('should return VIN from scenario vehicleInfo', () => {
    const simulator = new ObdSimulator(audiIdleScenario)
    expect(simulator.getVin()).toBe('WUAZZZ8V0KA123456')
  })

  it('should return vehicle info from scenario', () => {
    const simulator = new ObdSimulator(audiIdleScenario)
    const info = simulator.getVehicleInfo()
    expect(info.make).toBe('Audi')
    expect(info.model).toBe('A3')
    expect(info.year).toBe(2018)
  })

  it('should return supported PIDs including standard and scenario-specific', () => {
    const simulator = new ObdSimulator(audiIdleScenario)
    const pids = simulator.getSupportedPids()
    expect(pids).toContain('01 0C')
    expect(pids).toContain('09 02')
    expect(pids).toContain('03')
  })

  it('should return null freeze frame when scenario has none', () => {
    const simulator = new ObdSimulator(audiIdleScenario)
    expect(simulator.getFreezeFrame()).toBeNull()
  })

  it('should return freeze frame from scenario when present', () => {
    const freeze: FreezeFrame = {
      dtcCode: 'P0301',
      pidValues: { rpm: 750, speed: 0 },
    }
    const scenarioWithFreeze: SimulationScenario = {
      ...audiIdleScenario,
      freezeFrame: freeze,
    }
    const simulator = new ObdSimulator(scenarioWithFreeze)
    expect(simulator.getFreezeFrame()).toEqual(freeze)
  })
})
