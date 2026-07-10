import type { SimulationScenario } from './simulationScenario.js'

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

  /** Devuelve los códigos DTC del escenario activo. */
  getRawDtcs(): string[] {
    return this.scenario.dtcConfig.map((dtc) => dtc.code)
  }

  /** Cambia el escenario de simulación activo. */
  setScenario(scenario: SimulationScenario): void {
    this.scenario = scenario
  }
}
