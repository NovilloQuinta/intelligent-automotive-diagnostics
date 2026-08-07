import type { VehicleScope } from './VehicleScope.js'

/**
 * Consulta contra un almacen vectorial.
 *
 * El filtro viaja estructurado, nunca como cadena de consulta: es lo que mantiene el puerto
 * libre del dialecto de cualquier motor. Cada adaptador lo traduce y escapa a su manera.
 */
export interface VectorQuery {
  readonly vector: readonly number[]
  readonly limit: number
  readonly filter?: VehicleScope
}
