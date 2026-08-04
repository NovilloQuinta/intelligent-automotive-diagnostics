/** Error lanzado cuando falla la validacion de un DiagnosisSession. */
export class DiagnosisSessionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DiagnosisSessionError'
  }
}

/** Entidad que representa una sesion de diagnostico realizada sobre un vehiculo. */
export class DiagnosisSession {
  readonly id: number
  readonly vehicleId: number
  readonly scenarioId?: string
  readonly startedAt: string
  readonly endedAt?: string

  constructor(params: {
    id: number
    vehicleId: number
    scenarioId?: string
    startedAt: string
    endedAt?: string
  }) {
    if (params.vehicleId <= 0) throw new DiagnosisSessionError(`vehicleId must be > 0, got ${params.vehicleId}`)
    if (params.scenarioId !== undefined && !params.scenarioId.trim()) {
      throw new DiagnosisSessionError('scenarioId must not be empty')
    }
    if (!params.startedAt) throw new DiagnosisSessionError('startedAt must not be empty')
    this.id = params.id
    this.vehicleId = params.vehicleId
    this.scenarioId = params.scenarioId
    this.startedAt = params.startedAt
    this.endedAt = params.endedAt
  }

  /** Indica si la sesion de diagnostico esta activa (no ha finalizado). */
  get isActive(): boolean {
    return this.endedAt === undefined || this.endedAt === null
  }
}
