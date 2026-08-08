import type { UserStats } from './UserStats.js'

/**
 * Resumen general del panel de administracion.
 *
 * `httpRequestsByPathApprox` NO son diagnosticos reales: no existe todavia una tabla que
 * persista diagnosticos ni llamadas al LLM (ver `proposal.md`, Fuera de alcance). Es una
 * agregacion de `audit_logs` por ruta, valida solo como proxy de trafico HTTP. El nombre
 * del campo y su documentacion Swagger (Bloque C) deben dejarlo explicito para no sugerir
 * una precision que los datos no tienen.
 */
export interface AdminOverview {
  readonly userStats: UserStats
  readonly recentErrorCount: number
  readonly httpRequestsByPathApprox: Readonly<Record<string, number>>
}
