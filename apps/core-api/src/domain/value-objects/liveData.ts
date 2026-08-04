/** Error lanzado cuando falla la validacion de LiveData. */
export class LiveDataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LiveDataError'
  }
}

/** Value Object que representa parametros de telemetria en tiempo real via OBD-II. */
export class LiveData {
  readonly rpm: number
  readonly coolantTemp: number
  readonly speed: number
  readonly intakeTemp: number

  constructor(params: { rpm: number; coolantTemp: number; speed: number; intakeTemp: number }) {
    if (params.rpm < 0) throw new LiveDataError(`RPM must be >= 0, got ${params.rpm}`)
    if (params.speed < 0) throw new LiveDataError(`Speed must be >= 0, got ${params.speed}`)
    if (params.coolantTemp < -40 || params.coolantTemp > 215) {
      throw new LiveDataError(`Coolant temperature must be between -40 and 215°C, got ${params.coolantTemp}`)
    }
    if (params.intakeTemp < -40 || params.intakeTemp > 215) {
      throw new LiveDataError(`Intake air temperature must be between -40 and 215°C, got ${params.intakeTemp}`)
    }
    this.rpm = params.rpm
    this.coolantTemp = params.coolantTemp
    this.speed = params.speed
    this.intakeTemp = params.intakeTemp
  }
}
