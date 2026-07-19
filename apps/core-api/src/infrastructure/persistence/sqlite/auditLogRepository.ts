import { desc } from 'drizzle-orm'
import * as schema from './schema.js'
import type { DiagnosticsDb } from './db.js'

/** Datos necesarios para crear un registro de auditoria. */
export interface CreateAuditLogInput {
  readonly method: string
  readonly path: string
  readonly statusCode: number
  readonly ip?: string | null
  readonly userAgent?: string | null
  readonly durationMs?: number | null
}

/** Registro de auditoria devuelto por el repositorio. */
export interface AuditLog {
  readonly id: number
  readonly method: string
  readonly path: string
  readonly statusCode: number
  readonly ip: string | null
  readonly userAgent: string | null
  readonly durationMs: number | null
  readonly createdAt: string
}

type AuditLogRow = typeof schema.auditLogs.$inferSelect

/** Implementacion del repositorio de auditoria con SQLite via Drizzle ORM. */
export class SqliteAuditLogRepository {
  constructor(private readonly db: DiagnosticsDb) {}

  private toEntity(row: AuditLogRow): AuditLog {
    return {
      id: row.id,
      method: row.method,
      path: row.path,
      statusCode: row.statusCode,
      ip: row.ip ?? null,
      userAgent: row.userAgent ?? null,
      durationMs: row.durationMs ?? null,
      createdAt: row.createdAt,
    }
  }

  /** Inserta un registro de auditoria. */
  async create(input: CreateAuditLogInput): Promise<AuditLog> {
    const result = await this.db
      .insert(schema.auditLogs)
      .values({
        method: input.method,
        path: input.path,
        statusCode: input.statusCode,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
        durationMs: input.durationMs ?? null,
      })
      .returning()

    return this.toEntity(result[0])
  }

  /** Devuelve los N registros mas recientes ordenados por fecha descendente. */
  async findRecent(limit: number): Promise<AuditLog[]> {
    const rows = await this.db
      .select()
      .from(schema.auditLogs)
      .orderBy(desc(schema.auditLogs.id))
      .limit(limit)

    return rows.map((row) => this.toEntity(row))
  }
}
