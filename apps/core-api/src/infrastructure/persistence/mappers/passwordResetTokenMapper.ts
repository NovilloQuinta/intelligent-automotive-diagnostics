import type * as schema from '../sqlite/schema.js'
import type { PasswordResetTokenRecord } from '@/application/dto/auth/PasswordResetTokenRecord.js'

type PasswordResetTokenRow = typeof schema.passwordResetTokens.$inferSelect

/** Convierte una fila de BD a un PasswordResetTokenRecord. */
export function toPasswordResetTokenRecord(row: PasswordResetTokenRow): PasswordResetTokenRecord {
  return {
    id: row.id,
    userId: row.userId,
    tokenHash: row.tokenHash,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    usedAt: row.usedAt ?? null,
  }
}
