import type { CreateAuditLogInput } from '@/application/dto/audit/CreateAuditLogInput.js'
import type { AdminAuditFilter } from '@/application/dto/admin/AdminAuditFilter.js'
import type { AdminListResult } from '@/application/dto/admin/AdminListResult.js'
import type { AuditLogEntry } from '@/application/dto/admin/AuditLogEntry.js'
import type { AuditLogStats, DateRange } from '@/application/dto/admin/AuditLogStats.js'

/** Contrato para persistir y leer registros de auditoria HTTP. */
export interface AuditLogRepository {
  /** Persiste un registro de auditoria. Fire-and-forget: no devuelve dato util. */
  create(input: CreateAuditLogInput): Promise<void>

  /**
   * Lista registros de auditoria filtrados/paginados y ordenados por fecha descendente.
   * Filtrado y paginacion se resuelven en SQL, nunca en memoria.
   */
  list(filter: AdminAuditFilter): Promise<AdminListResult<AuditLogEntry>>

  /** Resumen agregado (por status y por ruta) para un rango de fechas, sin filas individuales. */
  stats(range: DateRange): Promise<AuditLogStats>
}
