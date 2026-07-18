/** Sesión de diagnóstico asociada a un vehículo. */
export interface DiagnosisSession {
  readonly id?: number
  readonly vehicleId: number
  readonly scenarioId?: string
  readonly startedAt?: string
  readonly endedAt?: string
}
