import { desc } from 'drizzle-orm'
import * as schema from './schema.js'
import type { DiagnosticsDb } from './db.js'
import type { AuditLogRepository } from '@/application/ports/AuditLogRepository.js'
import type { CreateAuditLogInput } from '@/application/dto/CreateAuditLogInput.js'
import type { AuditLogOutput } from '@/application/dto/AuditLogOutput.js'
import { toAuditLogOutput, toAuditValues } from '@/infrastructure/persistence/mappers/auditLogMapper.js'

/** Implementacion del repositorio de auditoria con SQLite via Drizzle ORM. */
export class SqliteAuditLogRepository implements AuditLogRepository {
  constructor(private readonly db: DiagnosticsDb) {}

  async create(input: CreateAuditLogInput): Promise<void> {
    await this.db.insert(schema.auditLogs).values(toAuditValues(input))
  }

  async findRecent(limit: number): Promise<AuditLogOutput[]> {
    const rows = await this.db
      .select()
      .from(schema.auditLogs)
      .orderBy(desc(schema.auditLogs.id))
      .limit(limit)

    return rows.map((row) => toAuditLogOutput(row))
  }
}
