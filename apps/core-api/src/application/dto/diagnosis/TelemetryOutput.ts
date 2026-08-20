/** Telemetria en vivo con degradacion por PID: un valor `null` indica lectura fallida. */
export interface TelemetryOutput {
  rpm: number | null
  coolantTemp: number | null
  speed: number | null
  intakeTemp: number | null
}
