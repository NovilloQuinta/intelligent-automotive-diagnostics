import type { AdminLogsFilter } from '@/application/dto/admin/AdminLogsFilter.js'
import type { AdminListResult } from '@/application/dto/admin/AdminListResult.js'
import type { LogEntry } from '@/application/dto/admin/LogEntry.js'

/** Contrato de lectura para la tabla `logs` (trazabilidad de errores y eventos). */
export interface LogRepository {
  /**
   * Lista logs filtrados por `level`/`from`/`to`/`q`, paginados y ordenados por fecha
   * descendente. El filtrado y la paginacion se resuelven en SQL, nunca en memoria.
   */
  list(filter: AdminLogsFilter): Promise<AdminListResult<LogEntry>>
}
