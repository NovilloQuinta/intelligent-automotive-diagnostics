import type { SimulationScenario } from './simulationScenario.js'
import type { FreezeFrame } from '@/domain/entities/freezeFrame.js'
import type { VehicleInfo } from '@/domain/entities/vehicleInfo.js'

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
    if (mode === '01') {
      switch (pid.toUpperCase()) {
        case '0C':
          return sv.rpm
        case '05':
          return sv.coolantTemp
        case '0D':
          return sv.speed
        case '0F':
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

  /** Service 09 — Devuelve el VIN del vehículo simulado. */
  getVin(): string {
    return this.scenario.vehicleInfo.vin
  }

  /** Devuelve los PIDs soportados por el escenario. */
  getSupportedPids(): string[] {
    const pids = ['01 00', '01 0C', '01 05', '01 0D', '01 0F', '03', '09 02']
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
