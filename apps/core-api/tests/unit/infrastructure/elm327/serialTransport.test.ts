import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SerialPort } from 'serialport'
import { Elm327ConnectionError } from '@/infrastructure/elm327/errors.js'

/**
 * Mock de `serialport` equivalente al mock de `node:net` en tcpTransport.test.ts.
 * Cada llamada a `SerialPort` constructor devuelve un mock con eventos
 * registrables y un puntero por instancia.
 */
vi.mock('serialport', () => {
  const SerialPort = vi.fn((_config: unknown) => {
    const handlers: Record<string, (...args: unknown[]) => void> = {}
    const port = {
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        handlers[event] = cb
        return port
      }),
      write: vi.fn(),
      close: vi.fn(),
      drain: vi.fn(),
      emit: (event: string, ...args: unknown[]): void => {
        handlers[event]?.(...args)
      },
    }
    return port
  })
  return { SerialPort }
})

type MockSerialPort = {
  on: ReturnType<typeof vi.fn>
  write: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  drain: ReturnType<typeof vi.fn>
  emit: (event: string, ...args: unknown[]) => void
}

// Dynamic import para que el mock tome efecto antes de evaluar el módulo
let createClient: typeof import('@/infrastructure/elm327/serialTransport.js').createElm327SerialClient

beforeEach(async () => {
  vi.clearAllMocks()
  const mod = await import('@/infrastructure/elm327/serialTransport.js')
  createClient = mod.createElm327SerialClient
})

function lastPort(): MockSerialPort {
  const results = vi.mocked(SerialPort).mock.results
  return results[results.length - 1].value as unknown as MockSerialPort
}

/** Simula que el dispositivo responde con `raw` al puerto actual. */
function respond(raw: string): void {
  lastPort().emit('data', Buffer.from(raw))
}

/** Comprueba que el comando enviado al puerto es `cmd\r\n`. */
function expectSent(cmd: string): void {
  expect(lastPort().write).toHaveBeenCalledWith(`${cmd}\r\n`)
}

const ECHO_AT = 'AT\rOK\r\r>'
const ECHO_RPM = '01 0C\r41 0C 0C 80\r\r>'
const ECHO_SPEED = '01 0D\r41 0D 00\r\r>'

describe('createElm327SerialClient', () => {
  it('construct() no abre el puerto — solo connect() crea la conexión', () => {
    createClient({ path: '/dev/ttyUSB0', baudRate: 38400 })
    expect(SerialPort).not.toHaveBeenCalled()
  })

  it('connect() exitoso: SerialPort llamado 1 vez con path y baudRate correctos', async () => {
    const client = createClient({ path: '/dev/ttyUSB0', baudRate: 38400 })
    await client.connect()
    expect(SerialPort).toHaveBeenCalledTimes(1)
    expect(SerialPort).toHaveBeenCalledWith({ path: '/dev/ttyUSB0', baudRate: 38400 })

    // connect() es idempotente
    await client.connect()
    expect(SerialPort).toHaveBeenCalledTimes(1)
  })

  it('envío de AT responde OK', async () => {
    const client = createClient({ path: '/dev/ttyUSB0', baudRate: 38400 })
    await client.connect()

    const promise = client.sendCommand('AT')
    expectSent('AT')
    respond(ECHO_AT)
    await expect(promise).resolves.toBe(ECHO_AT)
  })

  it('negocia la sesión con el adaptador antes del primer comando de datos', async () => {
    const client = createClient({
      path: '/dev/ttyUSB0',
      baudRate: 38400,
      initCommands: ['ATZ', 'ATE0'],
    })
    await client.connect()

    const promise = client.sendCommand('01 0C')

    expectSent('ATZ')
    respond('ATZ\rELM327 v1.5\r\r>')
    await vi.waitFor(() => expectSent('ATE0'))
    respond('ATE0\rOK\r\r>')
    await vi.waitFor(() => expectSent('01 0C'))
    respond(ECHO_RPM)

    await expect(promise).resolves.toBe(ECHO_RPM)
  })

  it('sin initCommands no envía ningún AT — el emulador no negocia nada', async () => {
    const client = createClient({ path: '/dev/ttyUSB0', baudRate: 38400 })
    await client.connect()

    const promise = client.sendCommand('01 0C')

    expect(lastPort().write).toHaveBeenCalledTimes(1)
    expectSent('01 0C')
    respond(ECHO_RPM)
    await expect(promise).resolves.toBe(ECHO_RPM)
  })

  it('comando 01 0C responde 41 0C 0C 80', async () => {
    const client = createClient({ path: '/dev/ttyUSB0', baudRate: 38400 })
    await client.connect()

    const promise = client.sendCommand('01 0C')
    expectSent('01 0C')
    respond(ECHO_RPM)
    await expect(promise).resolves.toBe(ECHO_RPM)
  })

  it('no resuelve antes del prompt ">" — la promesa sigue pendiente tras datos parciales', async () => {
    const client = createClient({ path: '/dev/ttyUSB0', baudRate: 38400 })
    await client.connect()

    const promise = client.sendCommand('01 0C')
    expectSent('01 0C')

    respond('01 0C\r41 0C 0C 80\r\r')

    const raceResult = await Promise.race([
      promise.then(() => 'resolved' as const),
      new Promise<'still_pending'>((r) => setTimeout(() => r('still_pending'), 50)),
    ])
    expect(raceResult).toBe('still_pending')

    respond('>')
    await expect(promise).resolves.toBe(ECHO_RPM)
  })

  it('serializa comandos: el segundo sendCommand no escribe hasta que el primero resuelve', async () => {
    const client = createClient({ path: '/dev/ttyUSB0', baudRate: 38400 })
    await client.connect()

    const first = client.sendCommand('01 0C')
    expectSent('01 0C')

    const second = client.sendCommand('01 0D')
    expect(lastPort().write).toHaveBeenCalledTimes(1)

    respond(ECHO_RPM)
    await first

    expectSent('01 0D')
    respond(ECHO_SPEED)
    await expect(second).resolves.toBe(ECHO_SPEED)
  })

  it('timeout de comando (3s sin ">") rechaza con Elm327ConnectionError y cierra el puerto', async () => {
    vi.useFakeTimers()
    const client = createClient({
      path: '/dev/ttyUSB0',
      baudRate: 38400,
      timeout: 3000,
      maxRetries: 0,
    })
    await client.connect()
    const port = lastPort()

    const promise = client.sendCommand('01 0C')
    expectSent('01 0C')

    vi.advanceTimersByTime(3000)

    await expect(promise).rejects.toBeInstanceOf(Elm327ConnectionError)
    expect(port.close).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('close() destruye el puerto y rechaza comandos pendientes', async () => {
    const client = createClient({ path: '/dev/ttyUSB0', baudRate: 38400 })
    await client.connect()
    const port = lastPort()

    const inFlight = client.sendCommand('01 0C')
    const queued = client.sendCommand('01 0D')
    expectSent('01 0C')

    await client.close()

    expect(port.close).toHaveBeenCalled()
    await expect(inFlight).rejects.toMatchObject({
      name: 'Elm327ConnectionError',
      message: expect.stringContaining('Connection closed'),
    })
    await expect(queued).rejects.toMatchObject({
      name: 'Elm327ConnectionError',
      message: expect.stringContaining('Connection closed'),
    })
  })

  it('reconexión automática tras close del puerto con backoff exponencial', async () => {
    vi.useFakeTimers()
    const client = createClient({ path: '/dev/ttyUSB0', baudRate: 38400 })
    await client.connect()

    const promise = client.sendCommand('01 0C')
    expectSent('01 0C')

    // El puerto se cierra inesperadamente
    lastPort().emit('close')

    await vi.advanceTimersByTimeAsync(100)

    // Se ha creado un puerto nuevo y el comando se reenvía
    expect(SerialPort).toHaveBeenCalledTimes(2)
    expectSent('01 0C')
    respond(ECHO_RPM)
    await expect(promise).resolves.toBe(ECHO_RPM)
    vi.useRealTimers()
  })

  it('reconexión automática tras error del puerto: mismo comportamiento que close', async () => {
    vi.useFakeTimers()
    const client = createClient({ path: '/dev/ttyUSB0', baudRate: 38400 })
    await client.connect()

    const promise = client.sendCommand('01 0C')
    expectSent('01 0C')

    lastPort().emit('error', new Error('Device disconnected'))

    await vi.advanceTimersByTimeAsync(100)

    expect(SerialPort).toHaveBeenCalledTimes(2)
    expectSent('01 0C')
    respond(ECHO_RPM)
    await expect(promise).resolves.toBe(ECHO_RPM)
    vi.useRealTimers()
  })

  it('backoff exponencial: intentos de reconexión a 100ms, 200ms, 400ms, 800ms', async () => {
    vi.useFakeTimers()
    const client = createClient({ path: '/dev/ttyUSB0', baudRate: 38400 })
    await client.connect()

    expect(SerialPort).toHaveBeenCalledTimes(1)

    lastPort().emit('error', new Error('disconnected'))
    await vi.advanceTimersByTimeAsync(100)
    expect(SerialPort).toHaveBeenCalledTimes(2)

    lastPort().emit('error', new Error('disconnected'))
    await vi.advanceTimersByTimeAsync(200)
    expect(SerialPort).toHaveBeenCalledTimes(3)

    lastPort().emit('error', new Error('disconnected'))
    await vi.advanceTimersByTimeAsync(400)
    expect(SerialPort).toHaveBeenCalledTimes(4)

    lastPort().emit('error', new Error('disconnected'))
    await vi.advanceTimersByTimeAsync(800)
    expect(SerialPort).toHaveBeenCalledTimes(5)

    vi.useRealTimers()
  })

  it('connect() tras close(): no crea un puerto nuevo — el cliente cerrado no revive', async () => {
    const client = createClient({ path: '/dev/ttyUSB0', baudRate: 38400 })
    await client.connect()
    expect(SerialPort).toHaveBeenCalledTimes(1)

    await client.close()

    await client.connect()
    expect(SerialPort).toHaveBeenCalledTimes(1)
  })
})
