import type { CreateAuditLogInput } from '@/application/dto/audit/CreateAuditLogInput.js'

/** Contrato para persistir registros de auditoria HTTP. */
export interface AuditLogRepository {
  /** Persiste un registro de auditoria. Fire-and-forget: no devuelve dato util. */
  create(input: CreateAuditLogInput): Promise<void>
}
