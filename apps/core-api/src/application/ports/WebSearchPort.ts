import type { WebSearchResult } from '@/application/dto/web-search/WebSearchResult.js'

/**
 * Puerto de búsqueda web externa para enriquecer diagnósticos con información
 * de internet.
 *
 * La interfaz es mínima a propósito: sin parámetros de idioma, región ni
 * número de resultados. Esas son decisiones del adaptador concreto
 * (SerpAPI se configura con valores fijos razonables). Si en el futuro se
 * necesita variar esos parámetros por caso de uso, se añaden al puerto
 * entonces; hoy serían parámetros sin ningún llamador que los use.
 */
export interface WebSearchPort {
  search(query: string): Promise<readonly WebSearchResult[]>
}
