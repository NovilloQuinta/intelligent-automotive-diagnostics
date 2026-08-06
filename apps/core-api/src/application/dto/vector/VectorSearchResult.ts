/** Coincidencia de una busqueda semantica. Menor distancia, mas parecido. */
export interface VectorSearchResult<TEntry> {
  readonly entry: TEntry
  readonly distance: number
}
