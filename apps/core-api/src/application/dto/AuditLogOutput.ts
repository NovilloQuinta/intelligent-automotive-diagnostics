/** Registro de auditoria devuelto por el repositorio. */
export interface AuditLogOutput {
  readonly id: number
  readonly method: string
  readonly path: string
  readonly statusCode: number
  readonly ip: string | null
  readonly userAgent: string | null
  readonly durationMs: number | null
  readonly createdAt: string
}
