import { rateLimit } from 'express-rate-limit'
import { SqliteRateLimitStore } from '@/infrastructure/persistence/sqlite/rateLimitStore.js'

/** Configuracion del rate limiter. */
export interface RateLimiterConfig {
  readonly windowMinutes: number
  readonly maxRequests: number
  /**
   * Identifica al limitador dentro de la tabla de contadores. Sin el, dos
   * limitadores compartirian fila para una misma IP y agotar uno agotaria el
   * otro. Cada punto de montaje de `server.ts` declara el suyo.
   */
  readonly namespace: string
}

const DEFAULT_WINDOW_MINUTES = 15
const DEFAULT_MAX_REQUESTS = 100

/**
 * Decide si se aplica rate limiting.
 *
 * Sin `RATE_LIMIT_ENABLED` se limita solo en produccion, que es el
 * comportamiento historico: la suite hace decenas de peticiones al mismo
 * endpoint desde la misma IP, y en desarrollo recargar la SPA agotaria la cuota
 * en minutos. La variable existe para poder encender los limitadores y probarlos
 * de verdad sin tener que declararse en produccion.
 */
function rateLimitEnabled(): boolean {
  const raw = process.env.RATE_LIMIT_ENABLED
  if (raw === undefined || raw === '') return process.env.NODE_ENV === 'production'
  return raw === 'true'
}

/**
 * Namespace de reserva para quien no declare uno.
 *
 * Es determinista a proposito: un namespace que cambiase en cada arranque
 * dejaria el contador guardado inalcanzable tras el reinicio, que es justo lo
 * que la persistencia viene a evitar. A cambio, dos limitadores con la misma
 * ventana y el mismo limite que no declaren namespace **comparten contador**.
 */
function defaultNamespace(windowMinutes: number, maxRequests: number): string {
  return `default:${windowMinutes}m:${maxRequests}`
}

/** Aplica los valores por defecto a la ventana y al limite. */
function resolveLimits(config?: Partial<RateLimiterConfig>) {
  return {
    windowMinutes: config?.windowMinutes ?? DEFAULT_WINDOW_MINUTES,
    maxRequests: config?.maxRequests ?? DEFAULT_MAX_REQUESTS,
  }
}

/**
 * Crea un middleware de rate limiting que envuelve express-rate-limit.
 *
 * El contador se guarda en SQLite ({@link SqliteRateLimitStore}), no en memoria:
 * sobrevive al reinicio del proceso en lugar de devolverle a cada cliente su
 * cuota entera.
 */
export function createRateLimiter(config?: Partial<RateLimiterConfig>) {
  const { windowMinutes, maxRequests } = resolveLimits(config)
  const namespace = config?.namespace ?? defaultNamespace(windowMinutes, maxRequests)

  if (!rateLimitEnabled()) {
    return (_req: unknown, _res: unknown, next: () => void) => next()
  }

  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit: maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
    store: new SqliteRateLimitStore({ namespace }),
  })
}
