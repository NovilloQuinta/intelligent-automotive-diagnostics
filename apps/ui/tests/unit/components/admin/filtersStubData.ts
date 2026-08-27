/**
 * Datos del doble de `DataTableFilters`.
 *
 * Viven fuera de `filtersStub.tsx` porque `react-refresh/only-export-components`
 * avisa cuando un fichero exporta componentes y constantes a la vez.
 */

/** Rango fijo que dispara el boton `set-range`, para poder afirmar sobre el. */
export const STUB_RANGE = { from: '2026-08-01', to: '2026-08-27' }
