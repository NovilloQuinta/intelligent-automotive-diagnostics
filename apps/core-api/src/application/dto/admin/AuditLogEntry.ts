/** Fila de la tabla `audit_logs`, tal como la consume el panel de administracion. */
export interface AuditLogEntry {
  readonly id: number
  readonly method: string
  readonly path: string
  readonly statusCode: number
  readonly ip: string | null
  readonly userAgent: string | null
  readonly durationMs: number | null
  readonly userId: number | null
  readonly createdAt: string
}
