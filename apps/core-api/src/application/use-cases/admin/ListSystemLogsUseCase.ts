import type { LogRepository } from '@/application/ports/LogRepository.js'
import type { AdminLogsFilter } from '@/application/dto/admin/AdminLogsFilter.js'
import type { AdminListResult } from '@/application/dto/admin/AdminListResult.js'
import type { LogEntry } from '@/application/dto/admin/LogEntry.js'

/** Caso de uso: lista logs de aplicacion con el filtro ya validado por el controlador. */
export class ListSystemLogsUseCase {
  constructor(private readonly logRepo: LogRepository) {}

  async execute(filter: AdminLogsFilter): Promise<AdminListResult<LogEntry>> {
    return this.logRepo.list(filter)
  }
}
