import { and, eq, isNull } from 'drizzle-orm'
import * as schema from './schema.js'
import type { DiagnosticsDb } from './db.js'
import type { PasswordResetTokenRepository } from '@/application/ports/PasswordResetTokenRepository.js'
import type { PasswordResetTokenRecord } from '@/application/dto/auth/PasswordResetTokenRecord.js'
import { toPasswordResetTokenRecord } from '@/infrastructure/persistence/mappers/passwordResetTokenMapper.js'

/** Implementacion de {@link PasswordResetTokenRepository} con SQLite via Drizzle ORM. */
export class SqlitePasswordResetTokenRepository implements PasswordResetTokenRepository {
  constructor(private readonly db: DiagnosticsDb) {}

  async save(userId: number, tokenHash: string, expiresAt: string): Promise<void> {
    await this.db.insert(schema.passwordResetTokens).values({
      userId,
      tokenHash,
      expiresAt,
    })
  }

  async findByTokenHash(tokenHash: string): Promise<PasswordResetTokenRecord | null> {
    const rows = await this.db
      .select()
      .from(schema.passwordResetTokens)
      .where(eq(schema.passwordResetTokens.tokenHash, tokenHash))
      .limit(1)

    return rows.length === 0 ? null : toPasswordResetTokenRecord(rows[0])
  }

  async markUsed(tokenHash: string): Promise<void> {
    await this.db
      .update(schema.passwordResetTokens)
      .set({ usedAt: new Date().toISOString() })
      .where(eq(schema.passwordResetTokens.tokenHash, tokenHash))
  }

  async invalidateAllForUser(userId: number): Promise<void> {
    await this.db
      .update(schema.passwordResetTokens)
      .set({ usedAt: new Date().toISOString() })
      .where(
        and(
          eq(schema.passwordResetTokens.userId, userId),
          isNull(schema.passwordResetTokens.usedAt),
        ),
      )
  }
}
