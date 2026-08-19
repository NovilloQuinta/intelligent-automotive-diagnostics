import { and, count, desc, eq, gte, like, lte, ne, or, sql } from 'drizzle-orm'
import * as schema from './schema.js'
import type { DiagnosticsDb } from './db.js'
import type { UserRepository } from '@/application/ports/UserRepository.js'
import { User } from '@/domain/entities/User.js'
import type { CreateUserInput } from '@/application/dto/auth/CreateUserInput.js'
import { toUser, toCreateValues } from '@/infrastructure/persistence/mappers/userMapper.js'
import { toCountRecord } from '@/infrastructure/persistence/mappers/toCountRecord.js'
import type { AdminUsersFilter } from '@/application/dto/admin/AdminUsersFilter.js'
import type { AdminListResult } from '@/application/dto/admin/AdminListResult.js'
import type { UserStats } from '@/application/dto/admin/UserStats.js'
import { toSafeUser } from '@/application/shared/safeUser.js'
import type { FailedLoginState } from '@/application/dto/auth/FailedLoginState.js'

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
   *
   * Si el bloqueo anterior ya caduco, el contador arranca de nuevo en 1 y el
   * bloqueo se limpia. Sin esto el contador se quedaba pegado al umbral y el
   * primer fallo tras la expiracion volvia a bloquear 15 minutos enteros.
   *
   * Un bloqueo vigente no se prolonga: si se reescribiera en cada intento,
   * bastaria con seguir probando contraseñas para dejar a la victima fuera de
   * su cuenta indefinidamente.
   */
  async incrementFailedLogin(userId: number): Promise<FailedLoginState> {
    const nowIso = new Date().toISOString()
    const lockedUntilIso = new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString()

    // Comparacion lexicografica valida: `locked_until` siempre se escribe con
    // `toISOString()` (UTC, ancho fijo).
    const lockActive = sql`${schema.users.lockedUntil} IS NOT NULL AND ${schema.users.lockedUntil} > ${nowIso}`
    const lockExpired = sql`${schema.users.lockedUntil} IS NOT NULL AND ${schema.users.lockedUntil} <= ${nowIso}`
    const nextAttempts = sql`CASE
      WHEN ${lockExpired} THEN 1
      ELSE ${schema.users.failedLoginAttempts} + 1
    END`

    const rows = await this.db
      .update(schema.users)
      .set({
        failedLoginAttempts: nextAttempts,
        lockedUntil: sql`CASE
          WHEN ${lockActive} THEN ${schema.users.lockedUntil}
          WHEN ${nextAttempts} >= ${MAX_FAILED_ATTEMPTS} THEN ${lockedUntilIso}
          WHEN ${lockExpired} THEN NULL
          ELSE ${schema.users.lockedUntil}
        END`,
      })
      .where(eq(schema.users.id, userId))
      .returning({
        failedLoginAttempts: schema.users.failedLoginAttempts,
        lockedUntil: schema.users.lockedUntil,
      })

    const updated = rows[0]
    if (!updated) throw new Error(`User ${userId} not found while counting failed logins`)

    return updated
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
