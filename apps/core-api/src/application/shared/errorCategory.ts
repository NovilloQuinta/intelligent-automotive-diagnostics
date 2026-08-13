/**
 * Categoria de error transversal: describe COMO debe reaccionar el llamante,
 * no de donde viene el fallo.
 *
 * - `client_error`: la peticion era invalida o pedia algo inexistente. Reintentar igual no sirve.
 * - `server_error`: fallo propio. Puede merecer la pena reintentar tras corregir.
 * - `external_error`: fallo de un tercero (bus OBD, proveedor de busqueda). Reintentable.
 *
 * Vive en `application/shared` a proposito: si el contrato viviera en
 * `infrastructure/mcp`, cada modulo que quiera declarar la categoria de sus
 * errores tendria que depender del MCP, que no es asunto suyo.
 */
export type ErrorCategory = 'client_error' | 'server_error' | 'external_error'

/**
 * Error que declara su propia categoria.
 *
 * Implementarlo es lo unico que necesita una clase de error para que el MCP
 * la clasifique bien. No hay que registrar nada ni editar el toolkit.
 */
export interface CategorizedError {
  readonly errorCategory: ErrorCategory
}

const CATEGORIES: readonly ErrorCategory[] = ['client_error', 'server_error', 'external_error']

/** Categoria por defecto: si el error no dice nada, se asume fallo propio. */
const DEFAULT_CATEGORY: ErrorCategory = 'server_error'

function declaresCategory(err: unknown): err is CategorizedError {
  if (typeof err !== 'object' || err === null) return false
  const candidate = (err as Partial<CategorizedError>).errorCategory
  return typeof candidate === 'string' && CATEGORIES.includes(candidate as ErrorCategory)
}

/**
 * Devuelve la categoria que el error declara, o `server_error` si no declara
 * ninguna (o declara un valor que no es una categoria valida).
 */
export function categoryOf(err: unknown): ErrorCategory {
  return declaresCategory(err) ? err.errorCategory : DEFAULT_CATEGORY
}
