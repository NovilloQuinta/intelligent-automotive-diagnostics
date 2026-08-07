import type { VectorSearchOptions } from '@/application/dto/vector/VectorSearchOptions.js'
import type { VectorSearchResult } from '@/application/dto/vector/VectorSearchResult.js'

/** Repositorio de conocimiento con busqueda semantica, ajeno al motor vectorial. */
export interface VectorRepository<TEntry> {
  index(entry: TEntry): Promise<void>

  /** Devuelve los resultados ordenados de menor a mayor distancia. */
  search(query: string, options?: VectorSearchOptions): Promise<VectorSearchResult<TEntry>[]>
}
