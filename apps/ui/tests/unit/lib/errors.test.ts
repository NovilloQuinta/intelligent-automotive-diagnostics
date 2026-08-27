import { describe, expect, it } from 'vitest'
import { extractErrorMessage } from '../../../src/lib/errors'

describe('extractErrorMessage', () => {
  it('devuelve el mensaje cuando es un Error', () => {
    expect(extractErrorMessage(new Error('Network error'), 'fallback')).toBe('Network error')
  })

  it('conserva el mensaje de las subclases de Error', () => {
    class TimeoutError extends Error {}
    expect(extractErrorMessage(new TimeoutError('tardo demasiado'), 'fallback')).toBe(
      'tardo demasiado',
    )
  })

  // La rama que no cubria nadie: lo que el `catch` recibe no siempre es un Error.
  // Un `throw 'texto'` o un rechazo con un objeto plano caen aqui, y sin esta
  // rama el mecanico veria `undefined` en pantalla en vez del mensaje de respaldo.
  it.each([
    ['un string', 'boom'],
    ['un objeto plano', { message: 'boom' }],
    ['null', null],
    ['undefined', undefined],
    ['un numero', 500],
  ])('devuelve el fallback con %s', (_caso, valor) => {
    expect(extractErrorMessage(valor, 'Algo fue mal')).toBe('Algo fue mal')
  })
})
