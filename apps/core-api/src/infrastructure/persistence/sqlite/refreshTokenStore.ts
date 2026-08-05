import { eq } from 'drizzle-orm'
import * as schema from './schema.js'
import type { DiagnosticsDb } from './db.js'
import type { RefreshTokenRepository } from '@/application/ports/RefreshTokenRepository.js'
import type { RefreshTokenRecord } from '@/application/dto/RefreshTokenRecord.js'
import { toRefreshTokenRecord } from '@/infrastructure/persistence/mappers/refreshTokenMapper.js'

/** Implementacion de {@link RefreshTokenRepository} con SQLite via Drizzle ORM. */
export class SqliteRefreshTokenStore implements RefreshTokenRepository {
  constructor(private readonly db: DiagnosticsDb) {}

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

    return rows.length === 0 ? null : toRefreshTokenRecord(rows[0])
  }

  async revokeRefreshToken(tokenHash: string): Promise<void> {
    await this.db
      .update(schema.refreshTokens)
      .set({ revokedAt: new Date().toISOString() })
      .where(eq(schema.refreshTokens.tokenHash, tokenHash))
  }
}
