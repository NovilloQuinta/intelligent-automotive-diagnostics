import { z } from 'zod'
import { adminListFilterBaseSchema, refineDateRange } from './AdminListFilter.js'

/** Filtro para `GET /api/admin/audit-logs`: base comun + campos propios de auditoria HTTP. */
export const adminAuditFilterSchema = refineDateRange(
  adminListFilterBaseSchema.extend({
    statusCode: z.coerce.number().int().min(100).max(599).optional(),
    path: z.string().min(1).max(500).optional(),
    userId: z.coerce.number().int().positive().optional(),
  }),
)

/** Filtro validado para el listado de auditoria HTTP. */
export type AdminAuditFilter = z.infer<typeof adminAuditFilterSchema>
