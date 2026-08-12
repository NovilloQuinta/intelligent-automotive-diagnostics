import { describe, it, expect } from 'vitest'
import { ObdSimulator } from '@/infrastructure/simulation/simulator.js'
import { EcuInfo } from '@/domain/entities/ecuInfo.js'
import { Vin } from '@/domain/value-objects/vin.js'
import { FreezeFrame } from '@/domain/value-objects/freezeFrame.js'
import type { SimulationScenario } from '@/infrastructure/simulation/scenario.js'
import { seedScenarios } from '@/infrastructure/simulation/seedScenarios.js'
import type { LiveData } from '@/domain/value-objects/liveData.js'

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
    vin: new Vin('WUAZZZ8V0KA123456'),
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
        vin: new Vin('JKAKZ900H8A123456'),
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
    const freeze: FreezeFrame = new FreezeFrame({
      dtcCode: 'P0301',
      pidValues: { rpm: 750, speed: 0 },
    })
    const scenarioWithFreeze: SimulationScenario = {
      ...audiIdleScenario,
      freezeFrame: freeze,
    }
    const simulator = new ObdSimulator(scenarioWithFreeze)
    expect(simulator.getFreezeFrame()).toEqual(freeze)
  })

  it('should return the freeze frame when dtc matches the frame dtcCode', () => {
    const freeze: FreezeFrame = new FreezeFrame({
      dtcCode: 'P0301',
      pidValues: { rpm: 750, speed: 0 },
    })
    const scenarioWithFreeze: SimulationScenario = {
      ...audiIdleScenario,
      freezeFrame: freeze,
    }
    const simulator = new ObdSimulator(scenarioWithFreeze)

    expect(simulator.getFreezeFrame('P0301')).toEqual(freeze)
  })

  it('should return null when dtc does not match the frame dtcCode', () => {
    const freeze: FreezeFrame = new FreezeFrame({
      dtcCode: 'P0301',
      pidValues: { rpm: 750, speed: 0 },
    })
    const scenarioWithFreeze: SimulationScenario = {
      ...audiIdleScenario,
      freezeFrame: freeze,
    }
    const simulator = new ObdSimulator(scenarioWithFreeze)

    expect(simulator.getFreezeFrame('P0420')).toBeNull()
  })

  it('getEcus should return ECUs from scenario when defined', () => {
    const ecu = new EcuInfo({
      id: 0,
      vehicleId: 0,
      name: 'Engine Control Unit',
      requestAddr: '7E0',
      responseAddr: '7E8',
      type: 'ECM',
      protocol: 'ISO 15765-4 (CAN 11/500)',
    })
    const scenarioWithEcus: SimulationScenario = {
      ...audiIdleScenario,
      ecus: [ecu],
    }
    const simulator = new ObdSimulator(scenarioWithEcus)

    expect(simulator.getEcus()).toEqual([ecu])
  })

  it('getEcus should return empty array when scenario has no ecus', () => {
    const simulator = new ObdSimulator(audiIdleScenario)

    expect(simulator.getEcus()).toEqual([])
  })
})

describe('ObdSimulator with seed scenarios pidValues', () => {
  function seedScenario(id: string): SimulationScenario {
    const scenario = seedScenarios.find((s) => s.id === id)
    if (!scenario) throw new Error(`Seed scenario ${id} not found`)
    return scenario
  }

  const expectations: [string, Record<string, number>][] = [
    ['audi-a3-idle', { '01 11': 14, '01 04': 18, '01 42': 14.2 }],
    ['kawa-z900', { '01 11': 52, '01 04': 58, '01 42': 10.9 }],
  ]

  it.each(expectations)('should read the extra pidValues of %s', (id, values) => {
    const simulator = new ObdSimulator(seedScenario(id))

    for (const [key, expected] of Object.entries(values)) {
      const [mode, pid] = key.split(' ')
      expect(simulator.readPidValue(mode, pid)).toBe(expected)
    }
  })

  it.each(expectations)('should list the extra pidValues of %s as supported', (id, values) => {
    const simulator = new ObdSimulator(seedScenario(id))

    const supported = simulator.getSupportedPids()

    for (const key of Object.keys(values)) {
      expect(supported).toContain(key)
    }
  })
})

describe('ObdSimulator with seed scenarios — 16 Mode 01 PIDs', () => {
  function seedScenario(id: string): SimulationScenario {
    const scenario = seedScenarios.find((s) => s.id === id)
    if (!scenario) throw new Error(`Seed scenario ${id} not found`)
    return scenario
  }

  const audi16: Record<string, number> = {
    '04': 18,
    '05': 90,
    '06': 0,
    '07': 3.1,
    '0B': 35,
    '0C': 750,
    '0D': 0,
    '0E': 8,
    '0F': 25,
    '10': 3.5,
    '11': 14,
    '2F': 62,
    '31': 0,
    '42': 14.2,
    '46': 18,
    '5C': 95,
  }

  it('returns a deterministic value for all 16 Mode 01 PIDs (audi-a3-idle)', () => {
    const simulator = new ObdSimulator(seedScenario('audi-a3-idle'))

    for (const [pid, expected] of Object.entries(audi16)) {
      expect(simulator.readPidValue('01', pid)).toBe(expected)
    }
  })

  it('returns a deterministic value for all 16 Mode 01 PIDs (kawa-z900)', () => {
    const simulator = new ObdSimulator(seedScenario('kawa-z900'))
    const kawa16: Record<string, number> = {
      '04': 58,
      '05': 105,
      '06': -1.5,
      '07': 4.7,
      '0B': 78,
      '0C': 4500,
      '0D': 0,
      '0E': 24,
      '0F': 28,
      '10': 28,
      '11': 52,
      '2F': 45,
      '31': 0,
      '42': 10.9,
      '46': 20,
      '5C': 110,
    }

    for (const [pid, expected] of Object.entries(kawa16)) {
      expect(simulator.readPidValue('01', pid)).toBe(expected)
    }
  })
})
