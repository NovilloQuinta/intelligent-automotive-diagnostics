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
 * - Byte B: bit 7 = tipo de motor (0=gasolina, 1=diesel), bits 0-3 = monitores soportados
 * - Byte C: bits 7-5 = monitores completados (0-2)
 * - Byte D: bits 7-0 = monitores completados (3-10)
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
    const engineType: 'spark' | 'compression' = (byteB & 0x80) === 0 ? 'spark' : 'compression'

    const monitorNames = engineType === 'spark' ? SPARK_MONITORS : COMPRESSION_MONITORS

    const monitors: MonitorStatus[] = monitorNames.map((name, index) => {
      const supported = index < 4 ? (byteB & (1 << index)) !== 0 : true
      const completed = parseCompletedBit(byteC, byteD, index)
      return { name, supported, completed }
    })

    return new VehicleStatus({ milOn, dtcCount, engineType, monitors })
  }
}

/**
 * Extrae el bit de "completado" para el monitor en el indice dado.
 *
 * Los indices 0-2 se leen del byte C (bits 7-5).
 * Los indices 3-10 se leen del byte D (bits 7-0).
 */
function parseCompletedBit(byteC: number, byteD: number, index: number): boolean {
  if (index <= 2) {
    // Byte C: bit 7 → index 0, bit 6 → index 1, bit 5 → index 2
    return (byteC & (0x80 >> index)) !== 0
  }
  // Byte D: bit 7 → index 3, bit 6 → index 4, ..., bit 0 → index 10
  return (byteD & (0x80 >> (index - 3))) !== 0
}
