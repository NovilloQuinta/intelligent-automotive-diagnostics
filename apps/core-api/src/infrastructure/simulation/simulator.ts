import type { SimulationScenario } from './scenario.js'
import type { EcuInfo } from '@/domain/entities/ecuInfo.js'
import { FreezeFrame } from '@/domain/value-objects/freezeFrame.js'
import type { VehicleInfo } from '@/domain/value-objects/vehicleInfo.js'
import { VehicleStatus } from '@/domain/value-objects/vehicleStatus.js'
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
} from '@/domain/pids.js'
import { PidRawReadNotSupportedError } from '@/application/obd/obdErrors.js'

/** SAE J1979: el RPM se transmite en cuartos de vuelta (`(A*256+B)/4`). */
const RPM_SCALE = 4

/** SAE J1979: las temperaturas se transmiten con offset de 40 °C (`A-40`). */
const TEMP_OFFSET = 40

/** Un byte cubre 0..255. */
const BYTE_RANGE = 256

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
          throw new Error(`PID ${mode} ${pid} not supported by current scenario`)
      }
    }
    throw new Error(`PID ${mode} ${pid} not supported by current scenario`)
  }

  /**
   * Devuelve los bytes crudos SAE J1979 de uno de los sensores modelados por el escenario.
   *
   * El escenario guarda valores fisicos ya resueltos, no tramas: aqui se aplica la codificacion
   * inversa de cada PID estandar. Solo cubre los cuatro sensores del escenario — el simulador
   * modela escenarios fijos, no es un emulador OBD de proposito general.
   *
   * @throws {PidRawReadNotSupportedError} Para cualquier otro PID
   */
  readPidRawBytes(mode: string, pid: string): number[] {
    const sv = this.scenario.sensorValues
    if (mode === MODE_CURRENT_DATA) {
      switch (pid.toUpperCase()) {
        case PID_RPM: {
          const raw = Math.round(sv.rpm * RPM_SCALE)
          return [Math.floor(raw / BYTE_RANGE), raw % BYTE_RANGE]
        }
        case PID_COOLANT_TEMP:
          return [sv.coolantTemp + TEMP_OFFSET]
        case PID_SPEED:
          return [sv.speed]
        case PID_INTAKE_TEMP:
          return [sv.intakeTemp + TEMP_OFFSET]
      }
    }
    throw new PidRawReadNotSupportedError(mode, pid)
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
