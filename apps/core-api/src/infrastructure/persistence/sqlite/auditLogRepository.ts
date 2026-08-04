import * as schema from './schema.js'
import type { DiagnosticsDb } from './db.js'
import type { AuditLogRepository } from '@/application/ports/AuditLogRepository.js'
import type { CreateAuditLogInput } from '@/application/dto/CreateAuditLogInput.js'
import { toAuditValues } from '@/infrastructure/persistence/mappers/auditLogMapper.js'

/** Implementacion del repositorio de auditoria con SQLite via Drizzle ORM. */
export class SqliteAuditLogRepository implements AuditLogRepository {
  constructor(private readonly db: DiagnosticsDb) {}

  async create(input: CreateAuditLogInput): Promise<void> {
    await this.db.insert(schema.auditLogs).values(toAuditValues(input))
  }
}
