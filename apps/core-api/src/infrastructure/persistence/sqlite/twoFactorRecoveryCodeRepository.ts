import { and, count, eq, isNull } from 'drizzle-orm'
import * as schema from './schema.js'
import type { DiagnosticsDb } from './db.js'
import type { TwoFactorRecoveryCodeRepository } from '@/application/ports/TwoFactorRecoveryCodeRepository.js'

/** Implementacion de {@link TwoFactorRecoveryCodeRepository} con SQLite via Drizzle ORM. */
export class SqliteTwoFactorRecoveryCodeRepository implements TwoFactorRecoveryCodeRepository {
  constructor(private readonly db: DiagnosticsDb) {}

  async replaceAllForUser(userId: number, codeHashes: readonly string[]): Promise<void> {
    await this.deleteAllForUser(userId)
    if (codeHashes.length === 0) return
    await this.db
      .insert(schema.twoFactorRecoveryCodes)
      .values(codeHashes.map((codeHash) => ({ userId, codeHash })))
  }

  /**
   * Marca el codigo como usado y responde segun si la sentencia afecto a alguna fila.
   *
   * Decidir y marcar en la misma sentencia es lo que impide que dos peticiones
   * simultaneas con el mismo codigo lo canjeen las dos: el `WHERE used_at IS NULL`
   * solo se cumple para una.
   */
  async consume(userId: number, codeHash: string): Promise<boolean> {
    const result = await this.db
      .update(schema.twoFactorRecoveryCodes)
      .set({ usedAt: new Date().toISOString() })
      .where(
        and(
          eq(schema.twoFactorRecoveryCodes.userId, userId),
          eq(schema.twoFactorRecoveryCodes.codeHash, codeHash),
          isNull(schema.twoFactorRecoveryCodes.usedAt),
        ),
      )

    return result.changes > 0
  }

  async countUnused(userId: number): Promise<number> {
    const rows = await this.db
      .select({ total: count() })
      .from(schema.twoFactorRecoveryCodes)
      .where(
        and(
          eq(schema.twoFactorRecoveryCodes.userId, userId),
          isNull(schema.twoFactorRecoveryCodes.usedAt),
        ),
      )

    return rows[0]?.total ?? 0
  }

  async deleteAllForUser(userId: number): Promise<void> {
    await this.db
      .delete(schema.twoFactorRecoveryCodes)
      .where(eq(schema.twoFactorRecoveryCodes.userId, userId))
  }
}
