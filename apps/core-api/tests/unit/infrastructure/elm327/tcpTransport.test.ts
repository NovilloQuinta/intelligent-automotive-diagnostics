import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createConnection } from 'node:net'
import { Elm327ConnectionError } from '@/infrastructure/elm327/errors.js'

vi.mock('node:net', () => {
  const createConnection = vi.fn(() => {
    const handlers: Record<string, (...args: unknown[]) => void> = {}
    const socket = {
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        handlers[event] = cb
        return socket
      }),
      write: vi.fn(),
      destroy: vi.fn(),
      emit: (event: string, ...args: unknown[]): void => {
        handlers[event]?.(...args)
      },
    }
    return socket
  })
  return { createConnection }
})

type MockSocket = ReturnType<typeof createConnection>

const HOST = 'localhost'
const PORT = 35000

// Dynamic import to allow vi.mock to take effect before module evaluation
let createClient: typeof import('@/infrastructure/elm327/tcpTransport.js').createElm327TcpClient

beforeEach(async () => {
  vi.clearAllMocks()
  const mod = await import('@/infrastructure/elm327/tcpTransport.js')
  createClient = mod.createElm327TcpClient
})

function lastSocket(): MockSocket {
  const results = vi.mocked(createConnection).mock.results
  return results[results.length - 1].value as MockSocket
}

/** Simula que el emulador responde con `raw` a la conexión actual. */
function respond(raw: string): void {
  lastSocket().emit('data', Buffer.from(raw))
}

/** Comprueba que el comando enviado al socket es `cmd\r\n`. */
function expectSent(cmd: string): void {
  expect(lastSocket().write).toHaveBeenCalledWith(`${cmd}\r\n`)
}

const ECHO_RPM = '01 0C\r41 0C 0C 80 \r\r>'

describe('createElm327TcpClient', () => {
  it('sendCommand escribe "01 0C\\r\\n" y resuelve la respuesta al recibir ">"', async () => {
    const client = createClient({ host: HOST, port: PORT })
    const promise = client.sendCommand('01 0C')
    expectSent('01 0C')
    respond(ECHO_RPM)
    await expect(promise).resolves.toBe(ECHO_RPM)
  })

  it('no resuelve antes del prompt ">" — la promesa sigue pendiente tras datos parciales', async () => {
    const client = createClient({ host: HOST, port: PORT })
    const promise = client.sendCommand('01 0C')
    expectSent('01 0C')

    // Emitir datos sin el prompt ">"
    respond('01 0C\r41 0C 0C 80 \r\r')

    // Verificar que la promesa sigue pendiente
    const raceResult = await Promise.race([
      promise.then(() => 'resolved' as const),
      new Promise<'still_pending'>((r) => setTimeout(() => r('still_pending'), 50)),
    ])
    expect(raceResult).toBe('still_pending')

    // Emitir el prompt y verificar que ahora sí resuelve
    respond('>')
    await expect(promise).resolves.toBe(ECHO_RPM)
  })

  it('timeout (10ms) → rechaza con Elm327ConnectionError', async () => {
    vi.useFakeTimers()
    const client = createClient({ host: HOST, port: PORT, timeout: 10 })
    const promise = client.sendCommand('01 0C')
    expectSent('01 0C')

    vi.advanceTimersByTime(10)

    await expect(promise).rejects.toBeInstanceOf(Elm327ConnectionError)
    vi.useRealTimers()
  })

  it('error ECONNREFUSED en el socket → rechaza con Elm327ConnectionError', async () => {
    const client = createClient({ host: HOST, port: PORT })
    const promise = client.sendCommand('01 0C')
    expectSent('01 0C')

    const err = new Error('connect ECONNREFUSED 127.0.0.1:35000')
    err.name = 'Error'
    ;(err as NodeJS.ErrnoException).code = 'ECONNREFUSED'
    lastSocket().emit('error', err)

    await expect(promise).rejects.toBeInstanceOf(Elm327ConnectionError)
  })

  it('destruye el socket tras resolución exitosa', async () => {
    const client = createClient({ host: HOST, port: PORT })
    const promise = client.sendCommand('01 0C')
    respond(ECHO_RPM)
    await promise
    expect(lastSocket().destroy).toHaveBeenCalled()
  })

  it('destruye el socket y limpia el timer tras error', async () => {
    const client = createClient({ host: HOST, port: PORT })
    const promise = client.sendCommand('01 0C')
    expectSent('01 0C')

    const err = new Error('connect ECONNREFUSED 127.0.0.1:35000')
    err.name = 'Error'
    ;(err as NodeJS.ErrnoException).code = 'ECONNREFUSED'
    lastSocket().emit('error', err)

    await expect(promise).rejects.toBeInstanceOf(Elm327ConnectionError)
    expect(lastSocket().destroy).toHaveBeenCalled()
  })
})
