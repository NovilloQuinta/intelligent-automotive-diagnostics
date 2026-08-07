import { z } from 'zod'
import type { WebSearchPort } from '@/application/ports/WebSearchPort.js'
import type { WebSearchResult } from '@/application/dto/web-search/WebSearchResult.js'
import { WebSearchProviderError } from './WebSearchProviderError.js'

const MAX_WEB_SEARCH_RESULTS = 3
const SERPAPI_BASE_URL = 'https://serpapi.com/search.json'
const SERPAPI_ENGINE = 'google'

const serpApiResultSchema = z.object({
  title: z.string(),
  snippet: z.string().default(''),
  link: z.string(),
})

const serpApiResponseSchema = z.object({
  organic_results: z.array(z.unknown()).optional(),
  error: z.string().optional(),
})

/**
 * Valida y convierte la respuesta JSON de SerpAPI en {@link WebSearchResult}.
 *
 * Comprueba el campo `error` del cuerpo antes de parsear `organic_results`
 * (SerpAPI devuelve HTTP 200 con `{"error": "..."}` cuando la cuota se agota
 * o la API key es inválida). Los elementos de `organic_results` que no cumplan
 * el esquema Zod mínimo ({@link serpApiResultSchema}: `title` + `link`) se
 * descartan sin invalidar el resto. El resultado se trunca a
 * {@link MAX_WEB_SEARCH_RESULTS}.
 *
 * @throws {WebSearchProviderError} Si el cuerpo contiene el campo `error`
 *   o si la forma de la respuesta no es parseable en absoluto.
 */
function parseSerpApiResponse(body: unknown): readonly WebSearchResult[] {
  let parsed: z.infer<typeof serpApiResponseSchema>
  try {
    parsed = serpApiResponseSchema.parse(body)
  } catch {
    throw new WebSearchProviderError('Unexpected response format from search provider')
  }

  if (parsed.error) {
    throw new WebSearchProviderError(parsed.error)
  }

  const results = parsed.organic_results ?? []

  const mapped: WebSearchResult[] = []
  for (const item of results) {
    const result = serpApiResultSchema.safeParse(item)
    if (result.success) {
      mapped.push({
        title: result.data.title,
        snippet: result.data.snippet,
        url: result.data.link,
      })
    }
  }

  return mapped.slice(0, MAX_WEB_SEARCH_RESULTS)
}

/**
 * Crea un adaptador {@link WebSearchPort} contra la API REST de SerpAPI.
 *
 * Usa `fetch` nativo de Node.js (sin SDK). La API key viaja en la query string
 * de SerpAPI, por lo que **nunca** se loguea la URL completa: solo la query y
 * el conteo de resultados. Devuelve como máximo {@link MAX_WEB_SEARCH_RESULTS}
 * resultados por búsqueda.
 *
 * @param config - Objeto con la `apiKey` de SerpAPI.
 * @returns Un {@link WebSearchPort} respaldado por SerpAPI.
 */
export function createSerpApiClient(config: { apiKey: string }): WebSearchPort {
  return {
    async search(query: string): Promise<readonly WebSearchResult[]> {
      const url = new URL(SERPAPI_BASE_URL)
      url.searchParams.set('q', query)
      url.searchParams.set('engine', SERPAPI_ENGINE)
      url.searchParams.set('num', String(MAX_WEB_SEARCH_RESULTS))
      url.searchParams.set('api_key', config.apiKey)

      const res = await fetch(url, { headers: { Accept: 'application/json' } })

      if (!res.ok) {
        throw new WebSearchProviderError(res.status)
      }

      let body: unknown
      try {
        body = await res.json()
      } catch {
        throw new WebSearchProviderError('Invalid JSON from search provider')
      }

      return parseSerpApiResponse(body)
    },
  }
}
