import { describe, it, expect } from 'vitest'
import { NULL_LOGGER } from '@/application/shared/nullLogger.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'

/**
 * `NULL_LOGGER` existe para que un `LoggerPort` opcional se resuelva una vez y
 * los casos de uso dejen de encadenar `logger?.info(...)`. Su contrato es corto
 * pero real: implementar los cuatro niveles y no estallar con ningun argumento.
 *
 * Que no estalle importa porque se pasa donde antes no habia nada: si un nivel
 * faltase, el fallo no saldria aqui sino dentro del caso de uso que lo llama.
 */
describe('NULL_LOGGER', () => {
  const levels = ['debug', 'info', 'warn', 'error'] as const

  it.each(levels)('implementa %s', (level) => {
    expect(typeof NULL_LOGGER[level]).toBe('function')
  })

  it.each(levels)('%s traga el mensaje sin lanzar y sin devolver nada', (level) => {
    expect(() => NULL_LOGGER[level]('un mensaje')).not.toThrow()
    expect(NULL_LOGGER[level]('un mensaje')).toBeUndefined()
  })

  it.each(levels)('%s acepta tambien el contexto estructurado', (level) => {
    expect(() => NULL_LOGGER[level]('fallo', { userId: 1, err: new Error('x') })).not.toThrow()
  })

  it('satisface LoggerPort, que es lo que lo hace intercambiable', () => {
    const asPort: LoggerPort = NULL_LOGGER
    expect(asPort).toBe(NULL_LOGGER)
  })
})
