/** Contrato para persistir registros de auditoria HTTP. */
export interface AuditLogRepositoryPort {
  create(input: {
    method: string
    path: string
    statusCode: number
    ip?: string | null
    userAgent?: string | null
    durationMs?: number | null
  }): Promise<unknown>
}
