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
      setTimeout: vi.fn(),
      setKeepAlive: vi.fn(),
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
const ECHO_SPEED = '01 0D\r41 0D 00 \r\r>'

describe('createElm327TcpClient', () => {
  it('construct() no abre conexión — solo connect() crea el socket', () => {
    createClient({ host: HOST, port: PORT })
    expect(createConnection).not.toHaveBeenCalled()
  })

  it('connect() exitoso: createConnection llamado exactamente 1 vez con host:port correctos', async () => {
    const client = createClient({ host: HOST, port: PORT })
    await client.connect()
    expect(createConnection).toHaveBeenCalledTimes(1)
    expect(createConnection).toHaveBeenCalledWith({ host: HOST, port: PORT })

    // connect() es idempotente: no abre un segundo socket
    await client.connect()
    expect(createConnection).toHaveBeenCalledTimes(1)
  })

  it('sendCommand escribe al socket compartido y resuelve la respuesta al recibir ">"', async () => {
    const client = createClient({ host: HOST, port: PORT })
    await client.connect()

    const promise = client.sendCommand('01 0C')
    expectSent('01 0C')
    respond(ECHO_RPM)
    await expect(promise).resolves.toBe(ECHO_RPM)
  })

  it('no resuelve antes del prompt ">" — la promesa sigue pendiente tras datos parciales', async () => {
    const client = createClient({ host: HOST, port: PORT })
    await client.connect()

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

  it('timeout de comando (10ms) → rechaza con Elm327ConnectionError y destruye el socket', async () => {
    vi.useFakeTimers()
    const client = createClient({ host: HOST, port: PORT, timeout: 10, maxRetries: 0 })
    await client.connect()
    const socket = lastSocket()

    const promise = client.sendCommand('01 0C')
    expectSent('01 0C')

    vi.advanceTimersByTime(10)

    await expect(promise).rejects.toBeInstanceOf(Elm327ConnectionError)
    expect(socket.destroy).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('serializa comandos: el segundo sendCommand no escribe hasta que el primero resuelve', async () => {
    const client = createClient({ host: HOST, port: PORT })
    await client.connect()

    const first = client.sendCommand('01 0C')
    expectSent('01 0C')

    const second = client.sendCommand('01 0D')
    // El segundo comando está encolado: el socket compartido solo ha escrito una vez
    expect(lastSocket().write).toHaveBeenCalledTimes(1)

    respond(ECHO_RPM)
    await first

    // Ahora sí se envía el segundo comando por el mismo socket
    expectSent('01 0D')
    respond(ECHO_SPEED)
    await expect(second).resolves.toBe(ECHO_SPEED)
  })

  it('auto-reconexión tras close del socket: reintenta con backoff y reenvía el comando pendiente', async () => {
    vi.useFakeTimers()
    const client = createClient({ host: HOST, port: PORT })
    await client.connect()

    const promise = client.sendCommand('01 0C')
    expectSent('01 0C')

    lastSocket().emit('close')

    await vi.advanceTimersByTimeAsync(100)

    // Se ha abierto un socket nuevo y el comando pendiente se reenvía por él
    expect(createConnection).toHaveBeenCalledTimes(2)
    expectSent('01 0C')
    respond(ECHO_RPM)
    await expect(promise).resolves.toBe(ECHO_RPM)
    vi.useRealTimers()
  })

  it('auto-reconexión tras error del socket: mismo comportamiento que close', async () => {
    vi.useFakeTimers()
    const client = createClient({ host: HOST, port: PORT })
    await client.connect()

    const promise = client.sendCommand('01 0C')
    expectSent('01 0C')

    const err = new Error('connect ECONNREFUSED 127.0.0.1:35000')
    err.name = 'Error'
    ;(err as NodeJS.ErrnoException).code = 'ECONNREFUSED'
    lastSocket().emit('error', err)

    await vi.advanceTimersByTimeAsync(100)

    expect(createConnection).toHaveBeenCalledTimes(2)
    expectSent('01 0C')
    respond(ECHO_RPM)
    await expect(promise).resolves.toBe(ECHO_RPM)
    vi.useRealTimers()
  })

  it('backoff exponencial: intentos de reconexión a 100ms, 200ms, 400ms, 800ms', async () => {
    vi.useFakeTimers()
    const client = createClient({ host: HOST, port: PORT })
    await client.connect()

    const err = new Error('connect ECONNREFUSED')
    ;(err as NodeJS.ErrnoException).code = 'ECONNREFUSED'

    expect(createConnection).toHaveBeenCalledTimes(1)

    lastSocket().emit('error', err)
    await vi.advanceTimersByTimeAsync(100)
    expect(createConnection).toHaveBeenCalledTimes(2)

    lastSocket().emit('error', err)
    await vi.advanceTimersByTimeAsync(200)
    expect(createConnection).toHaveBeenCalledTimes(3)

    lastSocket().emit('error', err)
    await vi.advanceTimersByTimeAsync(400)
    expect(createConnection).toHaveBeenCalledTimes(4)

    lastSocket().emit('error', err)
    await vi.advanceTimersByTimeAsync(800)
    expect(createConnection).toHaveBeenCalledTimes(5)

    vi.useRealTimers()
  })

  it('close() graceful: destruye el socket, rechaza comandos pendientes y no reactiva la reconexión', async () => {
    const client = createClient({ host: HOST, port: PORT })
    await client.connect()
    const socket = lastSocket()

    const inFlight = client.sendCommand('01 0C')
    const queued = client.sendCommand('01 0D')
    expectSent('01 0C')

    await client.close()

    expect(socket.destroy).toHaveBeenCalled()
    await expect(inFlight).rejects.toMatchObject({
      name: 'Elm327ConnectionError',
      message: expect.stringContaining('Connection closed'),
    })
    await expect(queued).rejects.toMatchObject({
      name: 'Elm327ConnectionError',
      message: expect.stringContaining('Connection closed'),
    })

    // Tras close(), los eventos del socket no crean nuevas conexiones
    lastSocket().emit('close')
    lastSocket().emit('error', new Error('ECONNREFUSED'))
    expect(createConnection).toHaveBeenCalledTimes(1)
  })

  it('connect() tras close(): no crea un socket nuevo — el cliente cerrado no revive', async () => {
    const client = createClient({ host: HOST, port: PORT })
    await client.connect()
    expect(createConnection).toHaveBeenCalledTimes(1)

    await client.close()

    await client.connect()
    expect(createConnection).toHaveBeenCalledTimes(1)
  })

  it('close() durante reconexión pendiente despierta al drainer y los sendCommand posteriores rechazan sin colgarse', async () => {
    const client = createClient({ host: HOST, port: PORT })
    await client.connect()

    const inFlight = client.sendCommand('01 0C')
    expectSent('01 0C')

    // El emulador cae: el cliente entra en 'reconnecting' con timer de 100ms pendiente
    const err = new Error('connect ECONNREFUSED')
    ;(err as NodeJS.ErrnoException).code = 'ECONNREFUSED'
    lastSocket().emit('error', err)
    // Deja que el drainer se suspenda en `await reconnect()` ANTES del shutdown
    await Promise.resolve()

    // Shutdown con la reconexión aún pendiente — sin dejar que el timer dispare
    await client.close()

    // El comando posterior NO puede quedarse colgado: el drainer debe haber despertado
    // e isProcessing debe haberse reseteado (race con timeout real para detectar el hang)
    const queued = client.sendCommand('01 0D')
    const outcome = await Promise.race([
      queued.then(
        () => 'rejected' as const,
        () => 'rejected' as const,
      ),
      new Promise<'stuck'>((resolve) => setTimeout(() => resolve('stuck'), 50)),
    ])
    expect(outcome).toBe('rejected')
    await expect(queued).rejects.toMatchObject({
      name: 'Elm327ConnectionError',
      message: expect.stringContaining('Connection closed'),
    })
    await expect(inFlight).rejects.toMatchObject({
      name: 'Elm327ConnectionError',
      message: expect.stringContaining('Connection closed'),
    })
  })

  it('cap total de reconexión (30s): agota el backoff y rechaza la cola con "Reconnection failed after 30s"', async () => {
    vi.useFakeTimers()
    const client = createClient({ host: HOST, port: PORT })
    await client.connect()

    const promise = client.sendCommand('01 0C')
    expectSent('01 0C')

    const fail = (): void => {
      const err = new Error('connect ECONNREFUSED')
      ;(err as NodeJS.ErrnoException).code = 'ECONNREFUSED'
      lastSocket().emit('error', err)
    }

    fail()
    // Agotar el backoff: 100+200+400+800+1600+3200+6400+12800+25600 = 51100ms ≥ 30s total.
    // Cada avance dispara el timer del intento anterior; cada fail() derriba el socket nuevo.
    const delays = [100, 200, 400, 800, 1600, 3200, 6400, 12800, 25600]
    for (const delay of delays) {
      await vi.advanceTimersByTimeAsync(delay)
      fail()
    }

    // El siguiente intento excede el cap total: la cola se rechaza y NO se queda colgada
    vi.useRealTimers()
    const outcome = await Promise.race([
      promise.then(
        () => 'rejected' as const,
        () => 'rejected' as const,
      ),
      new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), 50)),
    ])
    expect(outcome).toBe('rejected')
    await expect(promise).rejects.toMatchObject({
      name: 'Elm327ConnectionError',
      message: 'Reconnection failed after 30s',
    })
    vi.useRealTimers()
  })

  it('error tardío de un socket viejo no rechaza el comando en vuelo por el socket nuevo', async () => {
    vi.useFakeTimers()
    const client = createClient({ host: HOST, port: PORT })
    await client.connect()
    const oldSocket = lastSocket()

    const promise = client.sendCommand('01 0C')
    expectSent('01 0C')

    // El socket viejo cae → reconexión con backoff
    oldSocket.emit('close')
    await vi.advanceTimersByTimeAsync(100)
    expect(createConnection).toHaveBeenCalledTimes(2)

    // El comando ya viaja por el socket nuevo...
    expectSent('01 0C')
    // ...pero llega un error tardío del socket VIEJO
    const err = new Error('connect ECONNREFUSED')
    ;(err as NodeJS.ErrnoException).code = 'ECONNREFUSED'
    oldSocket.emit('error', err)

    // El comando no se rechaza: el socket nuevo responde y resuelve
    respond(ECHO_RPM)
    await expect(promise).resolves.toBe(ECHO_RPM)

    // Y el error tardío no dispara otra reconexión
    expect(createConnection).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })
})
