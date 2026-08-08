/** Estado de un monitor de emisiones (soportado / completado). */
export interface MonitorStatus {
  readonly name: string
  readonly supported: boolean
  readonly completed: boolean
}

/** Monitores SAE J1979 para motores de encendido por chispa (gasolina). */
const SPARK_MONITORS: readonly string[] = [
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
] as const

/** Monitores SAE J1979 para motores de encendido por compresion (diesel). */
const COMPRESSION_MONITORS: readonly string[] = [
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
] as const

/** Maximo numero de DTCs representable en 7 bits. */
const MAX_DTC_COUNT = 127

/** Error lanzado cuando falla la validacion de un VehicleStatus. */
export class VehicleStatusError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VehicleStatusError'
  }
}

/**
 * Estado del testigo MIL y monitores de emisiones (Mode 01 PID 01).
 *
 * Decodifica los 4 bytes de datos del PID 01 segun SAE J1979:
 * - Byte A: bit 7 = MIL, bits 0-6 = nº de averias almacenadas
 * - Byte B: bits 0-2 = availability de common tests (misfire, fuelSystem, components),
 *           bit 3 = engine type (0=spark, 1=compression),
 *           bits 4-6 = completeness de common tests,
 *           bit 7 = reserved
 * - Byte C: bits 7-0 = availability de engine-specific tests (indices 3-10)
 * - Byte D: bits 7-0 = completeness de engine-specific tests (indices 3-10)
 */
export class VehicleStatus {
  readonly milOn: boolean
  readonly dtcCount: number
  readonly engineType: 'spark' | 'compression'
  readonly monitors: readonly MonitorStatus[]

  constructor(params: {
    milOn: boolean
    dtcCount: number
    engineType: 'spark' | 'compression'
    monitors: MonitorStatus[]
  }) {
    if (params.dtcCount < 0 || params.dtcCount > MAX_DTC_COUNT) {
      throw new VehicleStatusError(
        `dtcCount must be between 0 and ${MAX_DTC_COUNT}, got ${params.dtcCount}`,
      )
    }
    this.milOn = params.milOn
    this.dtcCount = params.dtcCount
    this.engineType = params.engineType
    this.monitors = [...params.monitors]
  }

  /**
   * Crea un {@link VehicleStatus} limpio: MIL apagado, 0 averias,
   * todos los monitores soportados y completados.
   */
  static clean(engineType: 'spark' | 'compression'): VehicleStatus {
    const monitorNames = engineType === 'spark' ? SPARK_MONITORS : COMPRESSION_MONITORS
    const monitors: MonitorStatus[] = monitorNames.map((name) => ({
      name,
      supported: true,
      completed: true,
    }))
    return new VehicleStatus({ milOn: false, dtcCount: 0, engineType, monitors })
  }

  /**
   * Decodifica los 4 bytes de datos del PID 01 en un {@link VehicleStatus}.
   *
   * @param dataBytes — Array de 4 bytes [A, B, C, D] recibidos del ECU.
   * @throws {VehicleStatusError} Si `dataBytes.length < 4`.
   */
  static parse(dataBytes: number[]): VehicleStatus {
    if (dataBytes.length < 4) {
      throw new VehicleStatusError(
        `PID 01 response must contain at least 4 data bytes, got ${dataBytes.length}`,
      )
    }

    const [byteA, byteB, byteC, byteD] = dataBytes

    const milOn = (byteA & 0x80) !== 0
    const dtcCount = byteA & 0x7f
    const engineType: 'spark' | 'compression' = (byteB & 0x08) === 0 ? 'spark' : 'compression'

    const monitorNames = engineType === 'spark' ? SPARK_MONITORS : COMPRESSION_MONITORS

    const monitors: MonitorStatus[] = monitorNames.map((name, index) => {
      if (index <= 2) {
        const supported = (byteB & (1 << index)) !== 0
        const completed = (byteB & (1 << (index + 4))) !== 0
        return { name, supported, completed }
      }
      const ci = index - 3
      const supported = (byteC & (0x80 >> ci)) !== 0
      const completed = (byteD & (0x80 >> ci)) !== 0
      return { name, supported, completed }
    })

    return new VehicleStatus({ milOn, dtcCount, engineType, monitors })
  }
}


