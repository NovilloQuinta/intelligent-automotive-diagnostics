import { z } from 'zod'
import { adminListFilterBaseSchema, refineDateRange } from './AdminListFilter.js'

/** Niveles conocidos del logger (ver `LoggerPort`/`Logger`). */
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const

/** Filtro para `GET /api/admin/logs`: base comun + nivel de log. */
export const adminLogsFilterSchema = refineDateRange(
  adminListFilterBaseSchema.extend({
    level: z.enum(LOG_LEVELS).optional(),
  }),
)

/** Filtro validado para el listado de logs de aplicacion. */
export type AdminLogsFilter = z.infer<typeof adminLogsFilterSchema>
