/** Entrada para crear un registro de auditoria HTTP. */
export interface CreateAuditLogInput {
  readonly method: string
  readonly path: string
  readonly statusCode: number
  readonly ip?: string | null
  readonly userAgent?: string | null
  readonly durationMs?: number | null
}

/** Contrato para persistir registros de auditoria HTTP. */
export interface AuditLogRepositoryPort {
  /** Persiste un registro de auditoria. Fire-and-forget: no devuelve dato util. */
  create(input: CreateAuditLogInput): Promise<void>
}
