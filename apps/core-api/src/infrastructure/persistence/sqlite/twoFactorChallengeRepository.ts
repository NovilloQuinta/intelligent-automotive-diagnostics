import { and, eq, isNull } from 'drizzle-orm'
import * as schema from './schema.js'
import type { DiagnosticsDb } from './db.js'
import type { TwoFactorChallengeRepository } from '@/application/ports/TwoFactorChallengeRepository.js'
import type { TwoFactorChallengeRecord } from '@/application/dto/auth/TwoFactorChallengeRecord.js'

/** Fila cruda de `two_factor_challenges`. */
type ChallengeRow = typeof schema.twoFactorChallenges.$inferSelect

/** Traduce la fila al registro que consume la capa de aplicacion. */
function toChallengeRecord(row: ChallengeRow): TwoFactorChallengeRecord {
  return {
    id: row.id,
    userId: row.userId,
    tokenHash: row.tokenHash,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    usedAt: row.usedAt,
  }
}

/** Implementacion de {@link TwoFactorChallengeRepository} con SQLite via Drizzle ORM. */
export class SqliteTwoFactorChallengeRepository implements TwoFactorChallengeRepository {
  constructor(private readonly db: DiagnosticsDb) {}

  async save(userId: number, tokenHash: string, expiresAt: string): Promise<void> {
    await this.db.insert(schema.twoFactorChallenges).values({ userId, tokenHash, expiresAt })
  }

  async findByTokenHash(tokenHash: string): Promise<TwoFactorChallengeRecord | null> {
    const rows = await this.db
      .select()
      .from(schema.twoFactorChallenges)
      .where(eq(schema.twoFactorChallenges.tokenHash, tokenHash))
      .limit(1)

    return rows.length === 0 ? null : toChallengeRecord(rows[0])
  }

  async markUsed(tokenHash: string): Promise<void> {
    await this.db
      .update(schema.twoFactorChallenges)
      .set({ usedAt: new Date().toISOString() })
      .where(eq(schema.twoFactorChallenges.tokenHash, tokenHash))
  }

  async invalidateAllForUser(userId: number): Promise<void> {
    await this.db
      .update(schema.twoFactorChallenges)
      .set({ usedAt: new Date().toISOString() })
      .where(
        and(
          eq(schema.twoFactorChallenges.userId, userId),
          isNull(schema.twoFactorChallenges.usedAt),
        ),
      )
  }
}
