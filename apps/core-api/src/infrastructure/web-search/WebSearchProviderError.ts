/**
 * Error lanzado cuando el proveedor de búsqueda web devuelve una respuesta
 * no satisfactoria (HTTP no-OK, error de cuota, API key invalida, etc.).
 *
 * El mensaje NUNCA incluye la URL completa de SerpAPI porque la api_key
 * viaja en la query string. Solo incluye el status o el mensaje de error
 * del cuerpo.
 */
export class WebSearchProviderError extends Error {
  override readonly name = 'WebSearchProviderError'

  constructor(detail: number | string) {
    const message =
      typeof detail === 'number'
        ? `Web search provider returned HTTP ${detail}`
        : `Web search provider error: ${detail}`
    super(message)
  }
}
