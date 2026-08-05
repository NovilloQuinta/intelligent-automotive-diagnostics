import { describe, it, expect, vi } from 'vitest'
import { createConnection } from 'node:net'
import {
  Elm327TcpRepository,
  Elm327ConnectionError,
  Elm327NoDataError,
  Elm327ParseError,
} from '@/infrastructure/elm327/elm327Adapter.js'

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

function makeRepo(timeout?: number): Elm327TcpRepository {
  return new Elm327TcpRepository({ host: HOST, port: PORT, timeout, maxRetries: 0 })
}

function lastSocket(): MockSocket {
  const results = vi.mocked(createConnection).mock.results
  return results[results.length - 1].value as MockSocket
}

/** Simula que el emulador responde con `raw` a la conexion actual. */
function respond(raw: string): void {
  lastSocket().emit('data', Buffer.from(raw))
}

/** Comprueba que el comando enviado al socket es `cmd\r\n`. */
function expectSent(cmd: string): void {
  expect(lastSocket().write).toHaveBeenCalledWith(`${cmd}\r\n`)
}

/** Respuestas ELM327 reales del emulador (echo + datos + prompt). */
const RESPONSES: Record<string, string> = {
  '01 0C': '01 0C\r41 0C 0C 80 \r\r>',
  '01 05': '01 05\r41 05 82 \r\r>',
  '01 0D': '01 0D\r41 0D 00 \r\r>',
  '01 00': '01 00\r41 00 B8 3B A8 13\r\r>',
  '22 11 30': '22 11 30\r62 11 30 0C 80 \r\r>',
  '22 F4 30': '22 F4 30\r62 F4 30 5A \r\r>',
  '03': '03\r43 03 01 04 01\r\r>',
  '09 02': '014\r0: 49 02 01 57 50 30\r1: 5A 5A 5A 39 39 5A\r2: 54 53 33 39 30 30\r3: 30 30\r\r>',
  '02 0C': '02 0C\r42 0C 0C 80\r\r>',
}

describe('Elm327TcpRepository', () => {
  it('readPid Mode 01 RPM: mock responde "41 0C 0C 80" → 800', async () => {
    const repo = makeRepo()
    const promise = repo.readPid('01', '0C')
    expectSent('01 0C')
    respond(RESPONSES['01 0C'])
    await expect(promise).resolves.toBe(800)
  })

  it('readPid Mode 01 Coolant: mock responde "41 05 82" → 90', async () => {
    const repo = makeRepo()
    const promise = repo.readPid('01', '05')
    expectSent('01 05')
    respond(RESPONSES['01 05'])
    await expect(promise).resolves.toBe(90)
  })

  it('readPid Mode 01 Speed: mock responde "41 0D 00" → 0', async () => {
    const repo = makeRepo()
    const promise = repo.readPid('01', '0D')
    expectSent('01 0D')
    respond(RESPONSES['01 0D'])
    await expect(promise).resolves.toBe(0)
  })

  it('readPid Mode 22 VAG: mock responde "62 11 30 0C 80" → 800', async () => {
    const repo = makeRepo()
    const promise = repo.readPid('22', '1130')
    expectSent('22 11 30')
    respond(RESPONSES['22 11 30'])
    await expect(promise).resolves.toBe(800)
  })

  it('readPid Mode 22 VAG coolant: mock responde "62 F4 30 5A" → 90', async () => {
    const repo = makeRepo()
    const promise = repo.readPid('22', 'F430')
    expectSent('22 F4 30')
    respond(RESPONSES['22 F4 30'])
    await expect(promise).resolves.toBe(90)
  })

  it('readDtcCodes: mock responde "43 03 01 04 01" → [P0301, P0401]', async () => {
    const repo = makeRepo()
    const promise = repo.readDtcCodes()
    expectSent('03')
    respond(RESPONSES['03'])
    const dtcs = await promise
    expect(dtcs).toEqual([
      { code: 'P0301', description: '' },
      { code: 'P0401', description: '' },
    ])
  })

  it('readDtcCodes: mock responde "NO DATA" → []', async () => {
    const repo = makeRepo()
    const promise = repo.readDtcCodes()
    expectSent('03')
    respond('NO DATA\r\r>')
    await expect(promise).resolves.toEqual([])
  })

  it('readVin: mock responde VIN multi-línea Porsche → "WP0ZZZ99ZTS390000"', async () => {
    const repo = makeRepo()
    const promise = repo.readVin()
    expectSent('09 02')
    respond(RESPONSES['09 02'])
    await expect(promise).resolves.toBe('WP0ZZZ99ZTS390000')
  })

  it('getFreezeFrame: mock responde "42 0C 0C 80" → freeze frame con valores', async () => {
    const repo = makeRepo()
    const promise = repo.getFreezeFrame('P0301')
    expectSent('02 0C')
    respond(RESPONSES['02 0C'])
    await expect(promise).resolves.toEqual({
      dtcCode: 'P0301',
      pidValues: { '0C': 800 },
    })
  })

  it('getVehicleInfo: lee VIN → { make: "Porsche", model: "unknown", year: 2026, ... }', async () => {
    const repo = makeRepo()
    const promise = repo.getVehicleInfo()
    expectSent('09 02')
    respond(RESPONSES['09 02'])
    const info = await promise
    expect(info.make).toBe('Porsche')
    expect(info.model).toBe('unknown')
    expect(info.year).toBe(2026)
    expect(info.engineType).toBe('unknown')
    expect(info.vin.value).toBe('WP0ZZZ99ZTS390000')
  })

  it('getSupportedPids: mock responde "41 00 B8 3B A8 13" → bitmask parse', async () => {
    const repo = makeRepo()
    const promise = repo.getSupportedPids()
    expectSent('01 00')
    respond(RESPONSES['01 00'])
    await expect(promise).resolves.toEqual([
      '01 01',
      '01 03',
      '01 04',
      '01 05',
      '01 0B',
      '01 0C',
      '01 0D',
      '01 0F',
      '01 10',
      '01 11',
      '01 13',
      '01 15',
      '01 1C',
      '01 1F',
      '01 20',
    ])
  })

  it('Timeout: mock nunca emite data → lanza Elm327ConnectionError', async () => {
    const repo = makeRepo(10)
    const promise = repo.readPid('01', '0C')
    expectSent('01 0C')
    // No se responde: el timeout del repo (10ms) debe lanzar el error
    await expect(promise).rejects.toBeInstanceOf(Elm327ConnectionError)
  })

  it('Connection refused: mock emite ECONNREFUSED → Elm327ConnectionError', async () => {
    const repo = makeRepo()
    const promise = repo.readPid('01', '0C')
    expectSent('01 0C')
    const err = new Error('connect ECONNREFUSED 127.0.0.1:35000')
    err.name = 'Error'
    ;(err as NodeJS.ErrnoException).code = 'ECONNREFUSED'
    lastSocket().emit('error', err)
    await expect(promise).rejects.toBeInstanceOf(Elm327ConnectionError)
  })

  it('Respuesta malformada: mock responde basura → Elm327ParseError', async () => {
    const repo = makeRepo()
    const promise = repo.readPid('01', '0C')
    expectSent('01 0C')
    respond('CAN ERROR\r\r>')
    await expect(promise).rejects.toBeInstanceOf(Elm327ParseError)
  })

  it('PID no soportado: mock responde "NO DATA" → Elm327NoDataError', async () => {
    const repo = makeRepo()
    const promise = repo.readPid('01', '0C')
    expectSent('01 0C')
    respond('NO DATA\r\r>')
    await expect(promise).rejects.toBeInstanceOf(Elm327NoDataError)
  })
})
