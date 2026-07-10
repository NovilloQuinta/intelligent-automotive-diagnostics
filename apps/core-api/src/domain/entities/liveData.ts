export type AbsStatus = 'normal' | 'fault'

export interface LiveData {
  readonly rpm: number
  readonly coolantTemp: number
  readonly speed: number
  readonly intakeTemp: number
  readonly absStatus?: AbsStatus
}
