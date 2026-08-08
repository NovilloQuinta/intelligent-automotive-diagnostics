import { describe, it, expect } from 'vitest'
import { VehicleStatus, type MonitorStatus } from '@/domain/value-objects/vehicleStatus.js'

/** Byte arrays para PID 01 (4 data bytes: A, B, C, D). */
const b = (a: number, b: number, c: number, d: number): number[] => [a, b, c, d]

describe('VehicleStatus', () => {
  describe('parse', () => {
    // ===== Spark Ignition (gasolina) =====

    it('should parse a clean spark vehicle: MIL off, 0 DTCs, all monitors complete', () => {
      // Byte B=0x77 → bits 0-2=1 (common tests available), bit3=0 (spark), bits 4-6=1 (common tests complete)
      // Byte C=0xFF → all 8 engine-specific monitors available
      // Byte D=0xFF → all 8 engine-specific monitors complete
      const bytes = b(0x00, 0x77, 0xff, 0xff)
      const status = VehicleStatus.parse(bytes)

      expect(status.milOn).toBe(false)
      expect(status.dtcCount).toBe(0)
      expect(status.engineType).toBe('spark')

      for (const m of status.monitors) {
        expect(m.supported).toBe(true)
        expect(m.completed).toBe(true)
      }
    })

    it('should parse a faulty spark vehicle: MIL on, 3 DTCs, engine-specific monitors incomplete', () => {
      // Byte A=0x83: MIL on (bit7=1), 3 DTCs (bits 0-6=0x03)
      // Byte B=0x77: common tests available+complete, spark
      // Byte C=0xFF: engine-specific monitors all available
      // Byte D=0x00: engine-specific monitors NOT completed
      const bytes = b(0x83, 0x77, 0xff, 0x00)
      const status = VehicleStatus.parse(bytes)

      expect(status.milOn).toBe(true)
      expect(status.dtcCount).toBe(3)
      expect(status.engineType).toBe('spark')

      // Common tests [0-2] complete (from byte B bits 4-6)
      expect(status.monitors[0].completed).toBe(true)
      expect(status.monitors[1].completed).toBe(true)
      expect(status.monitors[2].completed).toBe(true)
      // Engine-specific monitors [3-10] NOT completed (byte D = 0)
      for (let i = 3; i < status.monitors.length; i++) {
        expect(status.monitors[i].completed).toBe(false)
      }
    })

    it('should parse DTC count at max value (127)', () => {
      const bytes = b(0xff, 0x77, 0xff, 0xff)
      expect(VehicleStatus.parse(bytes).dtcCount).toBe(127)
    })

    it('should parse MIL on with 0 DTCs', () => {
      const bytes = b(0x80, 0x77, 0xff, 0xff)
      const status = VehicleStatus.parse(bytes)
      expect(status.milOn).toBe(true)
      expect(status.dtcCount).toBe(0)
    })

    // ===== Compression Ignition (diésel) =====

    it('should parse a compression vehicle with partial monitor completion', () => {
      // Byte A=0x03: MIL off, 3 DTCs
      // Byte B=0x6F: bits 0-2=1 (common tests available), bit3=1 (compression), bits 4-6=0b110
      //   → [0]=false, [1]=true, [2]=true
      // Byte C=0xFF: all 8 engine-specific monitors available
      // Byte D=0x80: bit 7 set → monitor[3] complete, rest not
      const bytes = b(0x03, 0x6f, 0xff, 0x80)
      const status = VehicleStatus.parse(bytes)

      expect(status.milOn).toBe(false)
      expect(status.dtcCount).toBe(3)
      expect(status.engineType).toBe('compression')
      expect(status.monitors.length).toBe(11)

      // Compression monitors: comprehensiveComponent, fuelSystem, misfire, egrSystem, ...
      expect(status.monitors[0].name).toBe('comprehensiveComponent')
      expect(status.monitors[0].completed).toBe(false) // byte B bit 4 = 0
      expect(status.monitors[1].completed).toBe(true)  // byte B bit 5 = 1
      expect(status.monitors[2].completed).toBe(true)  // byte B bit 6 = 1
      expect(status.monitors[3].completed).toBe(true)  // byte D bit 7 = 1
      expect(status.monitors[4].completed).toBe(false) // byte D bit 6 = 0
    })

    it('should identify spark vs compression from byte B bit 3', () => {
      expect(VehicleStatus.parse(b(0x00, 0x00, 0x00, 0x00)).engineType).toBe('spark')
      expect(VehicleStatus.parse(b(0x00, 0x08, 0x00, 0x00)).engineType).toBe('compression')
    })

    // ===== Edge cases =====

    it('should throw when bytes length < 4', () => {
      expect(() => VehicleStatus.parse([])).toThrow()
      expect(() => VehicleStatus.parse([0x00])).toThrow()
      expect(() => VehicleStatus.parse([0x00, 0x00, 0x00])).toThrow()
    })

    it('should handle all common tests unsupported (byte B bits 0-2 = 0)', () => {
      // Byte B=0x00: no common tests available, spark, no common tests complete
      // Byte C=0x00: no engine-specific monitors available
      // Byte D=0x00: no engine-specific monitors complete
      const bytes = b(0x00, 0x00, 0x00, 0x00)
      const status = VehicleStatus.parse(bytes)

      // Common tests [0-2] not supported
      for (let i = 0; i < 3; i++) {
        expect(status.monitors[i].supported).toBe(false)
      }
      // Engine-specific [3-10] not supported (byte C = 0)
      for (let i = 3; i < 11; i++) {
        expect(status.monitors[i].supported).toBe(false)
      }
    })

    it('should handle engine-specific monitors availability from byte C', () => {
      // Byte B=0x07: common tests available, spark, common tests not complete
      // Byte C=0x80: only monitor[3] available, rest not
      const bytes = b(0x00, 0x07, 0x80, 0x00)
      const status = VehicleStatus.parse(bytes)

      // Common tests [0-2] available (byte B bits 0-2)
      expect(status.monitors[0].supported).toBe(true)
      expect(status.monitors[1].supported).toBe(true)
      expect(status.monitors[2].supported).toBe(true)
      // Engine-specific: only [3] available (byte C bit 7)
      expect(status.monitors[3].supported).toBe(true)
      for (let i = 4; i < 11; i++) {
        expect(status.monitors[i].supported).toBe(false)
      }
    })

    it('should parse common tests completeness from byte B bits 4-6', () => {
      // Byte B=0x60: common tests not available (bits 0-2=0), spark (bit3=0),
      // completeness: bit4=0, bit5=1, bit6=1 → [0]=false, [1]=true, [2]=true
      const bytes = b(0x00, 0x60, 0x00, 0x00)
      const status = VehicleStatus.parse(bytes)

      // Common tests completeness from byte B
      expect(status.monitors[0].completed).toBe(false)
      expect(status.monitors[1].completed).toBe(true)
      expect(status.monitors[2].completed).toBe(true)
    })

    it('should return spark monitors in correct SAE J1979 order', () => {
      // Byte B=0x07: common tests available, bit3=0 (spark), not complete
      const status = VehicleStatus.parse(b(0x00, 0x07, 0xff, 0xff))
      const names = status.monitors.map((m) => m.name)

      expect(names).toEqual([
        'misfire',
        'fuelSystem',
        'comprehensiveComponent',
        'catalyst',
        'heatedCatalyst',
        'evaporativeSystem',
        'secondaryAirSystem',
        'acRefrigerant',
        'oxygenSensor',
        'oxygenSensorHeater',
        'egrSystem',
      ])
    })

    it('should return compression monitors in correct SAE J1979 order', () => {
      // Byte B=0x0F: bits 0-2=1, bit3=1 (compression), bits 4-6=0
      const status = VehicleStatus.parse(b(0x00, 0x0f, 0xff, 0xff))
      const names = status.monitors.map((m) => m.name)

      expect(names).toEqual([
        'comprehensiveComponent',
        'fuelSystem',
        'misfire',
        'egrSystem',
        'catalyst',
        'nmhcCatalyst',
        'boostPressure',
        'exhaustSensor',
        'pmFilter',
        'exhaustGasSensor',
        'reservedSparkEquivalent',
      ])
    })
  })

  describe('constructor', () => {
    it('should create instance with explicit values', () => {
      const monitors: MonitorStatus[] = [
        { name: 'misfire', supported: true, completed: true },
        { name: 'fuelSystem', supported: true, completed: false },
      ]
      const status = new VehicleStatus({
        milOn: true,
        dtcCount: 5,
        engineType: 'spark',
        monitors,
      })

      expect(status.milOn).toBe(true)
      expect(status.dtcCount).toBe(5)
      expect(status.engineType).toBe('spark')
      expect(status.monitors).toEqual(monitors)
    })

    it('should throw for dtcCount < 0', () => {
      expect(
        () =>
          new VehicleStatus({ milOn: false, dtcCount: -1, engineType: 'spark', monitors: [] }),
      ).toThrow()
    })

    it('should throw for dtcCount > 127', () => {
      expect(
        () =>
          new VehicleStatus({ milOn: false, dtcCount: 128, engineType: 'spark', monitors: [] }),
      ).toThrow()
    })
  })

  describe('clean', () => {
    it('should create a clean spark vehicle with all monitors complete', () => {
      const status = VehicleStatus.clean('spark')

      expect(status.milOn).toBe(false)
      expect(status.dtcCount).toBe(0)
      expect(status.engineType).toBe('spark')
      expect(status.monitors).toHaveLength(11)
      for (const m of status.monitors) {
        expect(m.supported).toBe(true)
        expect(m.completed).toBe(true)
      }
    })

    it('should create a clean compression vehicle with all monitors complete', () => {
      const status = VehicleStatus.clean('compression')

      expect(status.milOn).toBe(false)
      expect(status.dtcCount).toBe(0)
      expect(status.engineType).toBe('compression')
      expect(status.monitors).toHaveLength(11)
      for (const m of status.monitors) {
        expect(m.supported).toBe(true)
        expect(m.completed).toBe(true)
      }
    })
  })
})
