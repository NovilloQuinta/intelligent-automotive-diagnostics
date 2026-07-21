/** Estado del sistema ABS reportado por la ECU. */
export type AbsStatus = 'normal' | 'fault'

/** Parámetros de telemetría en tiempo real leídos vía OBD-II. */
export interface LiveData {
  readonly rpm: number
  readonly coolantTemp: number
  readonly speed: number
  readonly intakeTemp: number
  readonly absStatus?: AbsStatus
}
