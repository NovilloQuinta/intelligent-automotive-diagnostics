import type * as schema from '../sqlite/schema.js'
import type { CreateAuditLogInput } from '@/application/dto/CreateAuditLogInput.js'
import type { AuditLogOutput } from '@/application/dto/AuditLogOutput.js'

type AuditLogRow = typeof schema.auditLogs.$inferSelect

/** Convierte una fila de BD a un registro de auditoria. */
export function toAuditLogOutput(row: AuditLogRow): AuditLogOutput {
  return {
    id: row.id,
    method: row.method,
    path: row.path,
    statusCode: row.statusCode,
    ip: row.ip ?? null,
    userAgent: row.userAgent ?? null,
    durationMs: row.durationMs ?? null,
    createdAt: row.createdAt,
  }
}

/** Convierte un CreateAuditLogInput a valores para INSERT en BD. */
export function toAuditValues(input: CreateAuditLogInput) {
  return {
    method: input.method,
    path: input.path,
    statusCode: input.statusCode,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
    durationMs: input.durationMs ?? null,
  }
}
