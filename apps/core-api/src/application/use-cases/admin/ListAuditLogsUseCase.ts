import type { AuditLogRepository } from '@/application/ports/AuditLogRepository.js'
import type { AdminAuditFilter } from '@/application/dto/admin/AdminAuditFilter.js'
import type { AdminListResult } from '@/application/dto/admin/AdminListResult.js'
import type { AuditLogEntry } from '@/application/dto/admin/AuditLogEntry.js'

/** Caso de uso: lista auditoria HTTP con el filtro ya validado por el controlador. */
export class ListAuditLogsUseCase {
  constructor(private readonly auditRepo: AuditLogRepository) {}

  async execute(filter: AdminAuditFilter): Promise<AdminListResult<AuditLogEntry>> {
    return this.auditRepo.list(filter)
  }
}
