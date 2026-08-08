import type { VehicleScope } from './VehicleScope.js'

/** Opciones de una busqueda semantica. */
export interface VectorSearchOptions {
  readonly limit?: number
  readonly filter?: VehicleScope
}
