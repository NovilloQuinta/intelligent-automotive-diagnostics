import type { PaginationConfig } from '../../../../src/components/admin/DataTableFilters'
import { STUB_RANGE } from './filtersStubData'

/**
 * Doble de `DataTableFilters` para los tests de las tablas de administracion.
 *
 * Las tablas pasan sus callbacks de filtro a este componente, que en produccion
 * los cuelga de un `Select` de Radix. Radix necesita eventos de puntero que jsdom
 * no emite, asi que disparar esos callbacks a traves de la UI real es fragil y no
 * prueba nada de la tabla. El doble los expone como botones normales: lo que se
 * comprueba entonces es lo que de verdad le toca a la tabla —volver a la pagina 1
 * al cambiar un filtro y refetchear con los valores nuevos—, que es donde estan
 * los errores de esta familia.
 *
 * `DataTableFilters` tiene sus propios tests, que si renderizan el componente real.
 */
export type FiltersStubProps = {
  onSearchChange: (q: string) => void
  onDateRangeChange: (range: { from?: string; to?: string }) => void
  levelFilter?: { onChange: (level?: string) => void }
  pagination: PaginationConfig
}

export function FiltersStub({
  onSearchChange,
  onDateRangeChange,
  levelFilter,
  pagination,
}: FiltersStubProps) {
  return (
    <div>
      <button onClick={() => onSearchChange('busqueda')}>set-search</button>
      <button onClick={() => onDateRangeChange(STUB_RANGE)}>set-range</button>
      <button onClick={() => pagination.onPageSizeChange(50)}>set-page-size</button>
      <button onClick={() => pagination.onPageChange(3)}>go-page-3</button>
      {levelFilter && <button onClick={() => levelFilter.onChange('error')}>set-level</button>}
      <span data-testid="page">{pagination.page}</span>
      <span data-testid="page-size">{pagination.pageSize}</span>
    </div>
  )
}
