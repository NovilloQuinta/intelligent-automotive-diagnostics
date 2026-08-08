import { z } from 'zod'

/** Tope de `pageSize` para cualquier listado de administracion: nunca una pagina mayor. */
export const MAX_PAGE_SIZE = 100

/** Tamano de pagina por defecto cuando el cliente no lo especifica. */
const DEFAULT_PAGE_SIZE = 20

/**
 * Campos comunes a los tres listados de administracion (logs, auditoria, usuarios):
 * paginacion, rango de fechas y busqueda de texto libre.
 *
 * El tope de `pageSize` vive aqui, en el esquema Zod, para que ningun caso de uso ni
 * repositorio pueda saltarselo por error (ver `design.md`, Decision 3).
 */
export const adminListFilterBaseSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  q: z.string().min(1).max(200).optional(),
})

/** Filtro base comun a logs, auditoria y usuarios. */
export type AdminListFilter = z.infer<typeof adminListFilterBaseSchema>

/**
 * Aplica el invariante "`from` no puede ser posterior a `to`" a cualquier esquema que
 * extienda {@link adminListFilterBaseSchema}.
 *
 * Se aplica como `refine` externo (no dentro de la base) para que cada esquema hijo pueda
 * anadir sus propios campos con `.extend()` antes de que se valide el rango de fechas.
 */
export function refineDateRange<T extends z.ZodType<{ from?: string; to?: string }>>(
  schema: T,
): z.ZodEffects<T> {
  return schema.refine((data) => !data.from || !data.to || data.from <= data.to, {
    message: '"from" must not be after "to"',
    path: ['to'],
  })
}
