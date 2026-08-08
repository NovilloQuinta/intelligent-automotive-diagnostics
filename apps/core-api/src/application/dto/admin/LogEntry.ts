/** Fila de la tabla `logs`, tal como la consume el panel de administracion. */
export interface LogEntry {
  readonly id: number
  readonly level: string
  readonly message: string
  readonly context: string | null
  readonly createdAt: string
}
