import type { CreateAuditLogInput } from '@/application/dto/CreateAuditLogInput.js'

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
