import { eq, sql } from 'drizzle-orm'
import * as schema from './schema.js'
import type { DiagnosticsDb } from './db.js'
import type { UserRepository } from '@/application/ports/UserRepository.js'
import { User } from '@/domain/entities/user.js'
import type { CreateUserInput } from '@/application/dto/auth/CreateUserInput.js'
import { toUser, toCreateValues } from '@/infrastructure/persistence/mappers/userMapper.js'

const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_DURATION_MS = 15 * 60 * 1000

/** Implementacion de {@link UserRepository} con SQLite via Drizzle ORM. */
export class SqliteUserRepository implements UserRepository {
  constructor(private readonly db: DiagnosticsDb) {}

  async create(input: CreateUserInput): Promise<User> {
    const result = await this.db.insert(schema.users).values(toCreateValues(input)).returning()
    const created = result[0]
    if (!created) throw new Error('User insert returned no row')

    return toUser(created)
  }

  async findByEmail(email: string): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email.toLowerCase().trim()))
      .limit(1)

    return rows.length === 0 ? null : toUser(rows[0])
  }

  async findById(id: number): Promise<User | null> {
    const rows = await this.db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1)

    return rows.length === 0 ? null : toUser(rows[0])
  }

  /**
   * Suma uno al contador de intentos fallidos y bloquea la cuenta al llegar al
   * umbral, en una sola sentencia.
   *
   * Es atomico a proposito: la version anterior leia el contador y lo escribia
   * en dos sentencias, asi que N intentos en paralelo leian el mismo valor y
   * escribian el mismo +1 — el bloqueo a los 5 intentos se esquivaba sin mas
   * que paralelizar.
   */
  async incrementFailedLogin(userId: number): Promise<void> {
    const lockedUntilIso = new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString()

    await this.db
      .update(schema.users)
      .set({
        failedLoginAttempts: sql`${schema.users.failedLoginAttempts} + 1`,
        lockedUntil: sql`CASE
          WHEN ${schema.users.failedLoginAttempts} + 1 >= ${MAX_FAILED_ATTEMPTS}
          THEN ${lockedUntilIso}
          ELSE ${schema.users.lockedUntil}
        END`,
      })
      .where(eq(schema.users.id, userId))
  }

  async resetFailedLogins(userId: number): Promise<void> {
    await this.db
      .update(schema.users)
      .set({ failedLoginAttempts: 0, lockedUntil: null })
      .where(eq(schema.users.id, userId))
  }
}
