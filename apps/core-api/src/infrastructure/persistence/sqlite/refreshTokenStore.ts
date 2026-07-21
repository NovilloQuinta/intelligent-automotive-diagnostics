import { eq } from 'drizzle-orm'
import * as schema from './schema.js'
import type { DiagnosticsDb } from './db.js'
import type { RefreshTokenStorePort, RefreshTokenRecord } from '@/application/ports/refreshTokenStore.interface.js'

type RefreshTokenRow = typeof schema.refreshTokens.$inferSelect

/** Implementacion de {@link RefreshTokenStorePort} con SQLite via Drizzle ORM. */
export class SqliteRefreshTokenStore implements RefreshTokenStorePort {
  constructor(private readonly db: DiagnosticsDb) {}

  private toRecord(row: RefreshTokenRow): RefreshTokenRecord {
    return {
      userId: row.userId,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt ?? null,
    }
  }

  async saveRefreshToken(userId: number, tokenHash: string, expiresAt: string): Promise<void> {
    await this.db.insert(schema.refreshTokens).values({
      userId,
      tokenHash,
      expiresAt,
    })
  }

  async findRefreshToken(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const rows = await this.db
      .select()
      .from(schema.refreshTokens)
      .where(eq(schema.refreshTokens.tokenHash, tokenHash))
      .limit(1)

    return rows.length === 0 ? null : this.toRecord(rows[0])
  }

  async revokeRefreshToken(tokenHash: string): Promise<void> {
    await this.db
      .update(schema.refreshTokens)
      .set({ revokedAt: new Date().toISOString() })
      .where(eq(schema.refreshTokens.tokenHash, tokenHash))
  }
}
