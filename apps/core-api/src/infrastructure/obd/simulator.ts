import type { SimulationScenario } from '@/domain/simulationScenario.js'
import type { FreezeFrame } from '@/domain/freezeFrame.js'
import type { VehicleInfo } from '@/domain/vehicleProfile.js'
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

/** Simulador de tramas OBD-II que convierte escenarios a bytes hexadecimales. */
export class ObdSimulator {
  private scenario: SimulationScenario

  constructor(scenario: SimulationScenario) {
    this.scenario = scenario
  }

  /** Devuelve la trama de telemetría en hex (10 caracteres, 5 bytes SAE J1979). */
  getRawTelemetry(): string {
    const { rpm, coolantTemp, speed, intakeTemp } = this.scenario.sensorValues
    const rpmValue = Math.round(rpm * 4)
    const a = Math.floor(rpmValue / 256)
    const b = rpmValue % 256
    const coolantRaw = coolantTemp + 40
    const speedRaw = speed
    const intakeRaw = intakeTemp + 40

    return [a, b, coolantRaw, speedRaw, intakeRaw]
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

  /** Service 02 — Devuelve los datos de freeze frame simulados. */
  getFreezeFrame(_dtc?: string): FreezeFrame | null {
    return this.scenario.freezeFrame ?? null
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
}
