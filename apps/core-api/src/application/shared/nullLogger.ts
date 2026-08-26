import type { LoggerPort } from '@/application/ports/LoggerPort.js'

/**
 * Logger que no hace nada, para resolver un `LoggerPort` opcional una sola vez.
 *
 * Evita salpicar los casos de uso de `logger?.info(...)`: cada uno de esos
 * encadenamientos es una rama mas que leer —y que ESLint cuenta como
 * complejidad— para expresar algo que no es una decision del negocio.
 */
export const NULL_LOGGER: LoggerPort = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}
