import type { MetadataValue } from '@/application/dto/vector/VectorRecord.js'
import type { VectorSearchOptions } from '@/application/dto/vector/VectorSearchOptions.js'
import type { VectorSearchResult } from '@/application/dto/vector/VectorSearchResult.js'
import type { EmbeddingGenerator } from '@/application/ports/EmbeddingGenerator.js'
import type { VectorRepository } from '@/application/ports/VectorRepository.js'
import type { VectorStore } from '@/application/ports/VectorStore.js'

/** Resultados devueltos cuando la busqueda no indica limite. */
export const DEFAULT_SEARCH_LIMIT = 5

/** Toda entrada de conocimiento expone en `embeddedText` aquello que se embebe. */
export interface EmbeddableEntry {
  readonly embeddedText: string
}

/** Dependencias de un indice de conocimiento concreto. */
export interface KnowledgeIndexDeps<TEntry extends EmbeddableEntry> {
  readonly store: VectorStore
  readonly embed: EmbeddingGenerator
  readonly toMetadata: (entry: TEntry) => Record<string, MetadataValue>
  readonly fromMetadata: (metadata: Readonly<Record<string, unknown>>) => TEntry
  readonly defaultLimit?: number
}

/**
 * Crea un indice de conocimiento con busqueda semantica.
 *
 * No sabe que motor hay detras: habla con {@link VectorStore} y {@link EmbeddingGenerator},
 * asi que cambiar de base vectorial no toca este fichero.
 */
export function createKnowledgeIndex<TEntry extends EmbeddableEntry>(
  deps: KnowledgeIndexDeps<TEntry>,
): VectorRepository<TEntry> {
  const { store, embed, toMetadata, fromMetadata, defaultLimit = DEFAULT_SEARCH_LIMIT } = deps

  return {
    async index(entry: TEntry): Promise<void> {
      const vector = await embed(entry.embeddedText)

      await store.upsert([{ vector, metadata: toMetadata(entry) }])
    },

    async search(
      query: string,
      options?: VectorSearchOptions,
    ): Promise<VectorSearchResult<TEntry>[]> {
      const vector = await embed(query)

      const matches = await store.query({
        vector,
        limit: options?.limit ?? defaultLimit,
        filter: options?.filter,
      })

      return matches.map((match) => ({
        entry: fromMetadata(match.metadata),
        distance: match.distance,
      }))
    },
  }
}
