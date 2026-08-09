/** Error lanzado cuando falla la validacion de un DiagnosisSession. */
export class DiagnosisSessionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DiagnosisSessionError'
  }
}

/** Severidades estandarizadas de un diagnostico. */
export type SessionSeverity = 'low' | 'medium' | 'high' | 'critical'

/** Entidad que representa una sesion de diagnostico realizada sobre un vehiculo. */
export class DiagnosisSession {
  readonly id: number
  readonly vehicleId: number | null
  readonly userId: number | null
  readonly scenarioId?: string
  readonly startedAt: string
  readonly endedAt?: string
  readonly resultJson?: string
  readonly severity?: SessionSeverity
  readonly dtcCount?: number

  constructor(params: {
    id: number
    vehicleId?: number | null
    userId?: number | null
    scenarioId?: string
    startedAt: string
    endedAt?: string
    resultJson?: string
    severity?: SessionSeverity
    dtcCount?: number
  }) {
    if (params.scenarioId !== undefined && !params.scenarioId.trim()) {
      throw new DiagnosisSessionError('scenarioId must not be empty')
    }
    if (!params.startedAt) throw new DiagnosisSessionError('startedAt must not be empty')
    this.id = params.id
    this.vehicleId = params.vehicleId ?? null
    this.userId = params.userId ?? null
    this.scenarioId = params.scenarioId
    this.startedAt = params.startedAt
    this.endedAt = params.endedAt
    this.resultJson = params.resultJson
    this.severity = params.severity
    this.dtcCount = params.dtcCount
  }

  /** Indica si la sesion de diagnostico esta activa (no ha finalizado). */
  get isActive(): boolean {
    return this.endedAt === undefined || this.endedAt === null
  }
}
