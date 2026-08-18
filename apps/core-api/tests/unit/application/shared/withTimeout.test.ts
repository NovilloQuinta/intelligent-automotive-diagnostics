import { describe, it, expect, vi } from 'vitest'

import {
  withTimeout,
  TimeoutError,
  DIAGNOSIS_TIMEOUT_MS,
} from '@/application/shared/withTimeout.js'

/** Promesa que resuelve pasados `ms` milisegundos. */
function resolveAfter<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

/** Promesa que rechaza pasados `ms` milisegundos. */
function rejectAfter(ms: number, error: Error): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(error), ms))
}

describe('withTimeout', () => {
  it('resuelve con el valor cuando la promesa gana la carrera', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000, 'tarde')).resolves.toBe('ok')
  })

  it('rechaza con TimeoutError cuando se agota el plazo', async () => {
    const promise = withTimeout(resolveAfter(1000, 'tarde'), 5, 'se acabo el tiempo')

    await expect(promise).rejects.toBeInstanceOf(TimeoutError)
  })

  it('usa el mensaje recibido en el error de timeout', async () => {
    const promise = withTimeout(resolveAfter(1000, 'tarde'), 5, 'diagnostico agotado')

    await expect(promise).rejects.toThrow('diagnostico agotado')
  })

  it('propaga el rechazo de la promesa original si llega antes del plazo', async () => {
    const boom = new Error('fallo del bus')

    await expect(withTimeout(Promise.reject(boom), 1000, 'tarde')).rejects.toBe(boom)
  })

  it('limpia el timer cuando la promesa gana, para no dejar el proceso vivo', async () => {
    const clearSpy = vi.spyOn(global, 'clearTimeout')

    await withTimeout(Promise.resolve('ok'), 1000, 'tarde')

    expect(clearSpy).toHaveBeenCalled()
    clearSpy.mockRestore()
  })

  it('no deja un unhandled rejection cuando la promesa rechaza despues del timeout', async () => {
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)

    await expect(
      withTimeout(rejectAfter(20, new Error('tarde y mal')), 5, 'timeout'),
    ).rejects.toBeInstanceOf(TimeoutError)
    // Margen para que la promesa original rechace despues de perder la carrera.
    await new Promise((resolve) => setTimeout(resolve, 40))

    expect(unhandled).not.toHaveBeenCalled()
    process.off('unhandledRejection', unhandled)
  })

  it('expone el timeout compartido de diagnostico', () => {
    expect(DIAGNOSIS_TIMEOUT_MS).toBe(10_000)
  })
})

describe('TimeoutError', () => {
  it('se distingue por tipo y no por el texto del mensaje', () => {
    const error = new TimeoutError('lo que sea')

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('TimeoutError')
  })
})
