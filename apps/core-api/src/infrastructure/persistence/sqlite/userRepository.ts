import { and, count, desc, eq, gte, like, lte, or, sql } from 'drizzle-orm'
import * as schema from './schema.js'
import type { DiagnosticsDb } from './db.js'
import type { UserRepository } from '@/application/ports/UserRepository.js'
import { User } from '@/domain/entities/user.js'
import type { CreateUserInput } from '@/application/dto/auth/CreateUserInput.js'
import { toUser, toCreateValues } from '@/infrastructure/persistence/mappers/userMapper.js'
import type { AdminUsersFilter } from '@/application/dto/admin/AdminUsersFilter.js'
import type { AdminListResult } from '@/application/dto/admin/AdminListResult.js'
import type { UserStats } from '@/application/dto/admin/UserStats.js'
import { toSafeUser } from '@/application/shared/safeUser.js'

/** Traduce un {@link AdminUsersFilter} a las condiciones `WHERE` de `users`. */
function buildWhereClause(filter: AdminUsersFilter) {
  const conditions = []
  if (filter.q) {
    const pattern = `%${filter.q}%`
    conditions.push(or(like(schema.users.email, pattern), like(schema.users.username, pattern)))
  }
  if (filter.from) conditions.push(gte(schema.users.createdAt, filter.from))
  if (filter.to) conditions.push(lte(schema.users.createdAt, filter.to))

  return conditions.length > 0 ? and(...conditions) : undefined
}

/** Convierte pares `{ key, value }` de un `GROUP BY` en un `Record` indexado por clave. */
function toCountRecord(rows: readonly { key: string; value: number }[]): Record<string, number> {
  const record: Record<string, number> = {}
  for (const row of rows) {
    record[row.key] = row.value
  }
  return record
}

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

  /**
   * Lista usuarios paginados/filtrados. Pasa cada fila por {@link toUser} + `toSafeUser`
   * (la misma proyeccion que usa `/api/auth/me`), en vez de reimplementar una proyeccion
   * paralela que pueda olvidar `passwordHash`.
   */
  async list(filter: AdminUsersFilter): Promise<AdminListResult<Omit<User, 'passwordHash'>>> {
    const where = buildWhereClause(filter)
    const offset = (filter.page - 1) * filter.pageSize

    const [rows, totalRows] = await Promise.all([
      this.db
        .select()
        .from(schema.users)
        .where(where)
        .orderBy(desc(schema.users.createdAt))
        .limit(filter.pageSize)
        .offset(offset),
      this.db.select({ value: count() }).from(schema.users).where(where),
    ])

    return {
      items: rows.map((row) => toSafeUser(toUser(row))),
      total: totalRows[0]?.value ?? 0,
    }
  }

  async stats(): Promise<UserStats> {
    const [byUserTypeRows, byRoleRows] = await Promise.all([
      this.db
        .select({ key: schema.users.userType, value: count() })
        .from(schema.users)
        .groupBy(schema.users.userType),
      this.db
        .select({ key: schema.users.role, value: count() })
        .from(schema.users)
        .groupBy(schema.users.role),
    ])

    return {
      byUserType: toCountRecord(byUserTypeRows),
      byRole: toCountRecord(byRoleRows),
    }
  }
}
