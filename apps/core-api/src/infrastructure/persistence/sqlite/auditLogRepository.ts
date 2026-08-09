import { and, count, desc, eq, gte, like, lte } from 'drizzle-orm'
import * as schema from './schema.js'
import type { DiagnosticsDb } from './db.js'
import type { AuditLogRepository } from '@/application/ports/AuditLogRepository.js'
import type { CreateAuditLogInput } from '@/application/dto/audit/CreateAuditLogInput.js'
import { toAuditValues } from '@/infrastructure/persistence/mappers/auditLogMapper.js'
import { toCountRecord } from '@/infrastructure/persistence/mappers/toCountRecord.js'
import type { AdminAuditFilter } from '@/application/dto/admin/AdminAuditFilter.js'
import type { AdminListResult } from '@/application/dto/admin/AdminListResult.js'
import type { AuditLogEntry } from '@/application/dto/admin/AuditLogEntry.js'
import type { AuditLogStats, DateRange } from '@/application/dto/admin/AuditLogStats.js'

/** Traduce un {@link AdminAuditFilter} a las condiciones `WHERE` de `audit_logs`. */
function buildWhereClause(filter: AdminAuditFilter) {
  const conditions = []
  if (filter.statusCode !== undefined)
    conditions.push(eq(schema.auditLogs.statusCode, filter.statusCode))
  if (filter.path) conditions.push(eq(schema.auditLogs.path, filter.path))
  if (filter.userId !== undefined) conditions.push(eq(schema.auditLogs.userId, filter.userId))
  if (filter.from) conditions.push(gte(schema.auditLogs.createdAt, filter.from))
  if (filter.to) conditions.push(lte(schema.auditLogs.createdAt, filter.to))
  if (filter.q) conditions.push(like(schema.auditLogs.path, `%${filter.q}%`))

  return conditions.length > 0 ? and(...conditions) : undefined
}

/** Traduce un {@link DateRange} a las condiciones `WHERE` para los agregados de `stats`. */
function buildRangeWhereClause(range: DateRange) {
  const conditions = []
  if (range.from) conditions.push(gte(schema.auditLogs.createdAt, range.from))
  if (range.to) conditions.push(lte(schema.auditLogs.createdAt, range.to))

  return conditions.length > 0 ? and(...conditions) : undefined
}

/** Implementacion del repositorio de auditoria con SQLite via Drizzle ORM. */
export class SqliteAuditLogRepository implements AuditLogRepository {
  constructor(private readonly db: DiagnosticsDb) {}

  async create(input: CreateAuditLogInput): Promise<void> {
    await this.db.insert(schema.auditLogs).values(toAuditValues(input))
  }

  async list(filter: AdminAuditFilter): Promise<AdminListResult<AuditLogEntry>> {
    const where = buildWhereClause(filter)
    const offset = (filter.page - 1) * filter.pageSize

    const [items, totalRows] = await Promise.all([
      this.db
        .select()
        .from(schema.auditLogs)
        .where(where)
        .orderBy(desc(schema.auditLogs.createdAt))
        .limit(filter.pageSize)
        .offset(offset),
      this.db.select({ value: count() }).from(schema.auditLogs).where(where),
    ])

    return { items, total: totalRows[0]?.value ?? 0 }
  }

  async stats(range: DateRange): Promise<AuditLogStats> {
    const where = buildRangeWhereClause(range)

    const [byStatusRows, byPathRows] = await Promise.all([
      this.db
        .select({ key: schema.auditLogs.statusCode, value: count() })
        .from(schema.auditLogs)
        .where(where)
        .groupBy(schema.auditLogs.statusCode),
      this.db
        .select({ key: schema.auditLogs.path, value: count() })
        .from(schema.auditLogs)
        .where(where)
        .groupBy(schema.auditLogs.path),
    ])

    return {
      byStatusCode: toCountRecord(byStatusRows),
      byPath: toCountRecord(byPathRows),
    }
  }
}
