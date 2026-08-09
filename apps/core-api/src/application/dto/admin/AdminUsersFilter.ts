import { z } from 'zod'
import { adminListFilterBaseSchema, refineDateRange } from './AdminListFilter.js'

/**
 * Filtro para `GET /api/admin/users`: no anade campos propios, solo hereda `q` (email o
 * username) y el rango de fechas (registro) de la base comun.
 */
export const adminUsersFilterSchema = refineDateRange(adminListFilterBaseSchema)

/** Filtro validado para el listado de usuarios. */
export type AdminUsersFilter = z.infer<typeof adminUsersFilterSchema>
