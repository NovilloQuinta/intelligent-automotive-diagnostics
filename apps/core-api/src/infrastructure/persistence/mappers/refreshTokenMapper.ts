import type * as schema from '../sqlite/schema.js'
import type { RefreshTokenRecord } from '@/application/dto/auth/RefreshTokenRecord.js'

type RefreshTokenRow = typeof schema.refreshTokens.$inferSelect

/** Convierte una fila de BD a un RefreshTokenRecord. */
export function toRefreshTokenRecord(row: RefreshTokenRow): RefreshTokenRecord {
  return {
    userId: row.userId,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt ?? null,
  }
}
