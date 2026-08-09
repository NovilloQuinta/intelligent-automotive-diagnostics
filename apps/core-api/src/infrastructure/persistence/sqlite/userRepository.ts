import { and, eq, ne } from 'drizzle-orm'

const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_DURATION_MS = 15 * 60 * 1000
import * as schema from './schema.js'
import type { DiagnosticsDb } from './db.js'
import type { UserRepository } from '@/application/ports/UserRepository.js'
import { User } from '@/domain/entities/user.js'
import type { CreateUserInput } from '@/application/dto/auth/CreateUserInput.js'
import { toUser, toCreateValues } from '@/infrastructure/persistence/mappers/userMapper.js'

/** Implementacion de {@link UserRepository} con SQLite via Drizzle ORM. */
export class SqliteUserRepository implements UserRepository {
  constructor(private readonly db: DiagnosticsDb) {}

  async create(input: CreateUserInput): Promise<User> {
    const result = await this.db.insert(schema.users).values(toCreateValues(input)).returning()

    return toUser(result[0])
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

  async incrementFailedLogin(userId: number): Promise<void> {
    const user = await this.findById(userId)
    if (!user) return

    const newAttempts = user.failedLoginAttempts + 1
    const lockedUntil =
      newAttempts >= MAX_FAILED_ATTEMPTS
        ? new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString()
        : user.lockedUntil

    await this.db
      .update(schema.users)
      .set({ failedLoginAttempts: newAttempts, lockedUntil })
      .where(eq(schema.users.id, userId))
  }

  async resetFailedLogins(userId: number): Promise<void> {
    await this.db
      .update(schema.users)
      .set({ failedLoginAttempts: 0, lockedUntil: null })
      .where(eq(schema.users.id, userId))
  }

  async updatePassword(userId: number, passwordHash: string): Promise<void> {
    await this.db.update(schema.users).set({ passwordHash }).where(eq(schema.users.id, userId))
  }

  async updateProfile(
    userId: number,
    patch: Partial<Pick<User, 'username' | 'address' | 'businessName' | 'taxId'>>,
  ): Promise<User> {
    await this.db.update(schema.users).set(patch).where(eq(schema.users.id, userId))

    const updated = await this.findById(userId)
    if (!updated) {
      throw new Error(`User ${userId} not found after update`)
    }
    return updated
  }

  async existsByUsername(username: string, excludeUserId?: number): Promise<boolean> {
    const conditions =
      excludeUserId === undefined
        ? eq(schema.users.username, username)
        : and(eq(schema.users.username, username), ne(schema.users.id, excludeUserId))

    const rows = await this.db.select().from(schema.users).where(conditions).limit(1)

    return rows.length > 0
  }
}
