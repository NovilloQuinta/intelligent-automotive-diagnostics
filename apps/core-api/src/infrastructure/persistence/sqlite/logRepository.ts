import { and, count, desc, eq, gte, like, lte } from 'drizzle-orm'
import * as schema from './schema.js'
import type { DiagnosticsDb } from './db.js'
import type { LogRepository } from '@/application/ports/LogRepository.js'
import type { AdminLogsFilter } from '@/application/dto/admin/AdminLogsFilter.js'
import type { AdminListResult } from '@/application/dto/admin/AdminListResult.js'
import type { LogEntry } from '@/application/dto/admin/LogEntry.js'

/** Traduce un {@link AdminLogsFilter} a las condiciones `WHERE` de la tabla `logs`. */
function buildWhereClause(filter: AdminLogsFilter) {
  const conditions = []
  if (filter.level) conditions.push(eq(schema.logs.level, filter.level))
  if (filter.from) conditions.push(gte(schema.logs.createdAt, filter.from))
  if (filter.to) conditions.push(lte(schema.logs.createdAt, filter.to))
  if (filter.q) conditions.push(like(schema.logs.message, `%${filter.q}%`))

  return conditions.length > 0 ? and(...conditions) : undefined
}

/**
 * Implementacion de {@link LogRepository} con SQLite via Drizzle ORM.
 *
 * Filtrado, orden y paginacion viven en la consulta SQL: la tabla `logs` escribe una fila
 * por cada linea de log (incluido `debug`), asi que traer todo y filtrar en memoria seria
 * el cuello de botella del panel en cuanto la app lleve unas semanas corriendo.
 */
export class SqliteLogRepository implements LogRepository {
  constructor(private readonly db: DiagnosticsDb) {}

  async list(filter: AdminLogsFilter): Promise<AdminListResult<LogEntry>> {
    const where = buildWhereClause(filter)
    const offset = (filter.page - 1) * filter.pageSize

    const [items, totalRows] = await Promise.all([
      this.db
        .select()
        .from(schema.logs)
        .where(where)
        .orderBy(desc(schema.logs.createdAt))
        .limit(filter.pageSize)
        .offset(offset),
      this.db.select({ value: count() }).from(schema.logs).where(where),
    ])

    return { items, total: totalRows[0]?.value ?? 0 }
  }
}
