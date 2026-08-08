import { pipeline } from '@xenova/transformers'
import type { FeatureExtractionPipeline } from '@xenova/transformers'

const MODEL_NAME = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2'

let cachedPipeline: FeatureExtractionPipeline | null = null

async function getPipeline(): Promise<FeatureExtractionPipeline> {
  if (cachedPipeline) {
    return cachedPipeline
  }
  cachedPipeline = await pipeline('feature-extraction', MODEL_NAME)
  return cachedPipeline
}

/** Reinicia la instancia de pipeline cacheada para testing. */
export function resetEmbeddingCache(): void {
  cachedPipeline = null
}

/**
 * Genera un vector de embedding normalizado para el texto dado usando un
 * modelo transformer multilingue (espanol + ingles).
 *
 * @param text - El texto de entrada a embeber. No debe estar vacio.
 * @returns Un vector de 384 dimensiones normalizado (norma L2 = 1).
 * @throws Si el texto esta vacio o el modelo falla al cargar.
 */
export async function createEmbedding(text: string): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    throw new Error('El texto no puede estar vacio')
  }

  const pipe = await getPipeline()
  const output = await pipe(text, {
    pooling: 'mean',
    normalize: true,
  })

  // El tensor conserva la dimension de lote: su forma es [1, 384]. `tolist()` la mantiene,
  // asi que hay que quedarse con la primera fila o se devuelve un array de longitud 1.
  const [vector] = output.tolist() as number[][]

  return vector
}
