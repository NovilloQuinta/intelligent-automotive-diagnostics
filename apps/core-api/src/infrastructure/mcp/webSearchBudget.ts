/**
 * Contador de presupuesto por sesión de diagnóstico.
 *
 * Cada llamada a {@link createMcpServer} crea su propio presupuesto. Como
 * `createMcpServer` se invoca una vez por `cognitiveDiagnosis()`/`callMcpTool()`,
 * el presupuesto vive y muere con la petición HTTP, sin estado compartido entre
 * sesiones ni fugas entre usuarios.
 */
export interface WebSearchBudget {
  tryConsume(): boolean
}

/** Llamadas máximas a `web_search` por sesión de diagnóstico cognitivo. */
export const MAX_WEB_SEARCHES_PER_SESSION = 3

/**
 * Crea un presupuesto de llamadas `web_search` con un máximo de intentos.
 *
 * @param maxCalls — Máximo de llamadas permitidas antes de que `tryConsume()`
 *   empiece a devolver `false`. Por defecto {@link MAX_WEB_SEARCHES_PER_SESSION}.
 * @returns Una instancia independiente; dos presupuestos no comparten estado.
 */
export function createWebSearchBudget(
  maxCalls = MAX_WEB_SEARCHES_PER_SESSION,
): WebSearchBudget {
  let remaining = maxCalls

  return {
    tryConsume(): boolean {
      if (remaining <= 0) return false
      remaining -= 1
      return true
    },
  }
}
