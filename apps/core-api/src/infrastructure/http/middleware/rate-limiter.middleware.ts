import { rateLimit } from 'express-rate-limit'

/** Configuracion del rate limiter. */
export interface RateLimiterConfig {
  readonly windowMinutes: number
  readonly maxRequests: number
}

const DEFAULT_WINDOW_MINUTES = 15
const DEFAULT_MAX_REQUESTS = 100

/** Crea un middleware de rate limiting que envuelve express-rate-limit. */
export function createRateLimiter(config?: Partial<RateLimiterConfig>) {
  const windowMinutes = config?.windowMinutes ?? DEFAULT_WINDOW_MINUTES
  const maxRequests = config?.maxRequests ?? DEFAULT_MAX_REQUESTS

  if (process.env.NODE_ENV !== 'production') {
    return (_req: unknown, _res: unknown, next: () => void) => next()
  }

  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit: maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
  })
}
