import type { SimulationScenario } from './scenario.js'
import type { EcuInfo } from '@/domain/entities/EcuInfo.js'
import { FreezeFrame } from '@/domain/value-objects/FreezeFrame.js'
import type { VehicleInfo } from '@/domain/value-objects/VehicleInfo.js'
import { VehicleStatus } from '@/domain/value-objects/VehicleStatus.js'
import {
  MODE_CURRENT_DATA,
  MODE_DTC,
  MODE_VIN,
  PID_SUPPORTED,
  PID_VIN,
  PID_RPM,
  PID_COOLANT_TEMP,
  PID_SPEED,
  PID_INTAKE_TEMP,
  PID_ENGINE_LOAD,
  PID_THROTTLE_POSITION,
  PID_CONTROL_MODULE_VOLTAGE,
  PID_SHORT_TERM_FUEL_TRIM,
  PID_LONG_TERM_FUEL_TRIM,
  PID_MANIFOLD_ABS_PRESSURE,
  PID_TIMING_ADVANCE,
  PID_MASS_AIR_FLOW,
  PID_FUEL_TANK_LEVEL,
  PID_DISTANCE_SINCE_CLEARED,
  PID_AMBIENT_AIR_TEMP,
  PID_ENGINE_OIL_TEMP,
} from '@/domain/pids.js'
import { PidRawReadNotSupportedError } from '@/application/obd/obdErrors.js'

/** SAE J1979: el RPM se transmite en cuartos de vuelta (`(A*256+B)/4`). */
const RPM_SCALE = 4

/** SAE J1979: las temperaturas se transmiten con offset de 40 °C (`A-40`). */
const TEMP_OFFSET = 40

/** Un byte cubre 0..255. */
const BYTE_RANGE = 256

/** SAE J1979: carga, acelerador y nivel de combustible se transmiten en 1/255 (`A*100/255`). */
const PERCENT_SCALE = 255

/** SAE J1979: el ajuste de combustible (STFT/LTFT) se codifica con escala 128 y offset 100. */
const FUEL_TRIM_SCALE = 128
const FUEL_TRIM_OFFSET = 100

/** SAE J1979: el avance de encendido se codifica en medios grados con offset 64 (`A/2-64`). */
const TIMING_SCALE = 2
const TIMING_OFFSET = 64

/** SAE J1979: el caudal masico se transmite en centesimas (`(A*256+B)/100`). */
const MAF_SCALE = 100

/** SAE J1979: el voltaje se transmite en milivoltios (`(A*256+B)/1000`). */
const VOLTAGE_SCALE = 1000

/** Codifica un entero no negativo en dos bytes SAE J1979 (alto, bajo). */
function toTwoBytes(raw: number): number[] {
  return [Math.floor(raw / BYTE_RANGE), raw % BYTE_RANGE]
}

/** Simulador de tramas OBD-II que convierte escenarios a bytes hexadecimales. */
export class ObdSimulator {
  private scenario: SimulationScenario

  constructor(scenario: SimulationScenario) {
    this.scenario = scenario
  }

  /** Devuelve la trama de telemetría en hex (10 caracteres, 5 bytes SAE J1979). */
  getRawTelemetry(): string {
    const bytes = [PID_RPM, PID_COOLANT_TEMP, PID_SPEED, PID_INTAKE_TEMP].flatMap((pid) =>
      this.readPidRawBytes(MODE_CURRENT_DATA, pid),
    )

    return bytes
      .map((n) => n.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  }

  /** Service 01 — Devuelve el valor físico de un PID simulado.
   * Busca en el mapa pidValues del escenario con clave `mode pid`.
   * Si no existe, devuelve el valor del sensor equivalente en LiveData.
   */
  readPidValue(mode: string, pid: string): number {
    const value = this.resolvePidValue(mode, pid)
    if (value === undefined) {
      throw new Error(`PID ${mode} ${pid} not supported by current scenario`)
    }
    return value
  }

  /**
   * Resuelve el valor fisico de un PID del escenario: primero en `pidValues`
   * (lecturas extra del escenario), luego en los cuatro sensores `sensorValues`.
   *
   * @returns El valor fisico, o `undefined` si el PID no esta modelado.
   */
  private resolvePidValue(mode: string, pid: string): number | undefined {
    const key = `${mode} ${pid}`
    const pidValues = this.scenario.pidValues ?? {}
    if (key in pidValues) return pidValues[key]

    const sv = this.scenario.sensorValues
    if (mode === MODE_CURRENT_DATA) {
      switch (pid.toUpperCase()) {
        case PID_RPM:
          return sv.rpm
        case PID_COOLANT_TEMP:
          return sv.coolantTemp
        case PID_SPEED:
          return sv.speed
        case PID_INTAKE_TEMP:
          return sv.intakeTemp
        default:
          return undefined
      }
    }
    return undefined
  }

  /**
   * Devuelve los bytes crudos SAE J1979 de uno de los PIDs Mode 01 modelados por el escenario.
   *
   * El escenario guarda valores fisicos ya resueltos (sensores + `pidValues`), no tramas:
   * aqui se aplica la codificacion inversa de cada PID estandar (los 16 Mode 01 del catalogo).
   *
   * @throws {PidRawReadNotSupportedError} Para cualquier PID fuera de los 16 Mode 01 modelados
   */
  readPidRawBytes(mode: string, pid: string): number[] {
    const value = this.resolvePidValue(mode, pid)
    if (value === undefined) throw new PidRawReadNotSupportedError(mode, pid)

    switch (pid.toUpperCase()) {
      case PID_RPM:
        return toTwoBytes(Math.round(value * RPM_SCALE))
      case PID_COOLANT_TEMP:
      case PID_INTAKE_TEMP:
      case PID_AMBIENT_AIR_TEMP:
      case PID_ENGINE_OIL_TEMP:
        return [Math.round(value + TEMP_OFFSET)]
      case PID_SPEED:
      case PID_MANIFOLD_ABS_PRESSURE:
        return [Math.round(value)]
      case PID_ENGINE_LOAD:
      case PID_THROTTLE_POSITION:
      case PID_FUEL_TANK_LEVEL:
        return [Math.round((value * PERCENT_SCALE) / 100)]
      case PID_SHORT_TERM_FUEL_TRIM:
      case PID_LONG_TERM_FUEL_TRIM:
        return [Math.round(((value + FUEL_TRIM_OFFSET) * FUEL_TRIM_SCALE) / 100)]
      case PID_TIMING_ADVANCE:
        return [Math.round((value + TIMING_OFFSET) * TIMING_SCALE)]
      case PID_MASS_AIR_FLOW:
        return toTwoBytes(Math.round(value * MAF_SCALE))
      case PID_DISTANCE_SINCE_CLEARED:
        return toTwoBytes(Math.round(value))
      case PID_CONTROL_MODULE_VOLTAGE:
        return toTwoBytes(Math.round(value * VOLTAGE_SCALE))
      default:
        throw new PidRawReadNotSupportedError(mode, pid)
    }
  }

  /** Service 02 — Devuelve los datos de freeze frame simulados como instancia de FreezeFrame. */
  getFreezeFrame(dtc?: string): FreezeFrame | null {
    const frame = this.scenario.freezeFrame
    if (!frame) return null
    if (dtc !== undefined && frame.dtcCode !== dtc) return null
    return new FreezeFrame({ dtcCode: frame.dtcCode, pidValues: { ...frame.pidValues } })
  }

  /** Service 09 — Devuelve el VIN del vehiculo simulado. */
  getVin(): string {
    return this.scenario.vehicleInfo.vin.value
  }

  /** Devuelve los PIDs soportados por el escenario. */
  getSupportedPids(): string[] {
    const pids = [
      `${MODE_CURRENT_DATA} ${PID_SUPPORTED}`,
      `${MODE_CURRENT_DATA} ${PID_RPM}`,
      `${MODE_CURRENT_DATA} ${PID_COOLANT_TEMP}`,
      `${MODE_CURRENT_DATA} ${PID_SPEED}`,
      `${MODE_CURRENT_DATA} ${PID_INTAKE_TEMP}`,
      MODE_DTC,
      `${MODE_VIN} ${PID_VIN}`,
    ]
    const pidValues = this.scenario.pidValues ?? {}
    for (const key of Object.keys(pidValues)) {
      if (!pids.includes(key)) pids.push(key)
    }
    return pids
  }

  /** Vehicle info del escenario. */
  getVehicleInfo(): VehicleInfo {
    return this.scenario.vehicleInfo
  }

  /** Devuelve los códigos DTC del escenario activo. */
  getRawDtcs(): string[] {
    return this.scenario.dtcConfig.map((dtc) => dtc.code)
  }

  /** Cambia el escenario de simulación activo. */
  setScenario(scenario: SimulationScenario): void {
    this.scenario = scenario
  }

  /** Devuelve las ECUs del escenario activo (vacio si no estan definidas). */
  getEcus(): EcuInfo[] {
    return this.scenario.ecus ?? []
  }

  /** Service 01 PID 01 — Estado del testigo MIL y monitores (simulado). */
  getVehicleStatus(): VehicleStatus {
    const isDiesel = /tdi|diesel/i.test(this.scenario.vehicleInfo.engineType)
    const engineType = isDiesel ? 'compression' : 'spark'
    // Hardcoded: sin averias, todos los monitores completados.
    return VehicleStatus.clean(engineType)
  }
}
