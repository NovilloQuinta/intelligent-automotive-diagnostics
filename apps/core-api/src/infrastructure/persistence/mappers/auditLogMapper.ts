import type { CreateAuditLogInput } from '@/application/dto/audit/CreateAuditLogInput.js'

/**
 * Convierte un CreateAuditLogInput a valores para INSERT en BD.
 *
 * `createdAt` se fija aqui explicitamente, no se deja al `default` de `schema.ts`: ese
 * default es la cadena literal `"datetime('now')"` (un valor de columna, no una expresion
 * SQL), asi que sin este valor explicito cada fila quedaria con ese texto literal en vez de
 * una fecha real — rompiendo silenciosamente cualquier filtro u orden por fecha aguas
 * arriba (list/stats del panel de administracion).
 */
export function toAuditValues(input: CreateAuditLogInput) {
  return {
    method: input.method,
    path: input.path,
    statusCode: input.statusCode,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
    durationMs: input.durationMs ?? null,
    userId: input.userId ?? null,
    createdAt: new Date().toISOString(),
  }
}
