import { z } from 'zod'

/** Limite por defecto de resultados para una busqueda de prueba en el panel. */
const DEFAULT_SEARCH_LIMIT = 5

/** Limite maximo de resultados que puede pedir el panel en una busqueda de prueba. */
const MAX_SEARCH_LIMIT = 20

/** Los tres indices del catalogo (ADR-007 §3), identificados con el mismo nombre corto. */
export const KNOWLEDGE_INDEX_NAMES = ['pids', 'dtcs', 'diagnoses'] as const

/** Body de `POST /api/admin/knowledge/search`. */
export const knowledgeSearchInputSchema = z
  .object({
    text: z.string().min(1).max(500).describe('Texto a buscar. Se vectoriza antes de comparar'),
    index: z.enum(KNOWLEDGE_INDEX_NAMES).describe('Indice contra el que buscar'),
    limit: z.coerce
      .number()
      .int()
      .positive()
      .max(MAX_SEARCH_LIMIT)
      .default(DEFAULT_SEARCH_LIMIT)
      .describe(`Resultados a devolver. Maximo ${MAX_SEARCH_LIMIT}`),
  })
  .describe('Busqueda semantica de prueba contra el catalogo vectorial')

/** Body validado de una busqueda de prueba contra el catalogo vectorial. */
export type KnowledgeSearchInput = z.infer<typeof knowledgeSearchInputSchema>
