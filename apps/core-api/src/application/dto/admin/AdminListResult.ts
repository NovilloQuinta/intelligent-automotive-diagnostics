/**
 * Resultado paginado generico para los listados de administracion.
 *
 * `total` es el numero de filas que cumplen el filtro (no el tamano de `items`), para que
 * la UI pueda calcular el numero de paginas sin traer todas las filas.
 */
export interface AdminListResult<T> {
  readonly items: readonly T[]
  readonly total: number
}
