/** Datos para crear un registro de auditoria HTTP. */
export interface CreateAuditLogInput {
  readonly method: string
  readonly path: string
  readonly statusCode: number
  readonly ip?: string | null
  readonly userAgent?: string | null
  readonly durationMs?: number | null
  readonly userId?: number | null
}
