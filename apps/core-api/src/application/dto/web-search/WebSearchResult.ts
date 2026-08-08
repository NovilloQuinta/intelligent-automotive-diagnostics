/**
 * Resultado individual de una búsqueda web externa.
 *
 * Contrato mínimo entre el puerto {@link WebSearchPort} y sus consumidores.
 * El adaptador concreto (ej. SerpAPI) rellena estos campos con datos del
 * proveedor; el resto del sistema solo conoce esta interfaz.
 */
export interface WebSearchResult {
  readonly title: string
  readonly snippet: string
  readonly url: string
}
