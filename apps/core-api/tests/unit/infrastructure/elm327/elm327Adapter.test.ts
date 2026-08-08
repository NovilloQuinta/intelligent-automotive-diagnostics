import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createConnection } from 'node:net'
import {
  Elm327TcpRepository,
  Elm327ConnectionError,
  Elm327NoDataError,
  Elm327ParseError,
} from '@/infrastructure/elm327/elm327Adapter.js'
import { EcuInfo } from '@/domain/entities/ecuInfo.js'

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
  '02 04': '02 04\r42 04 2E\r\r>',
  '02 05': '02 05\r42 05 82\r\r>',
  '02 0D': '02 0D\r42 0D 00\r\r>',
  '02 11': '02 11\r42 11 24\r\r>',
}

describe('Elm327TcpRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('constructor conecta eager: createConnection 1 vez con host:port correctos, sin enviar comandos', () => {
    makeRepo()
    expect(createConnection).toHaveBeenCalledTimes(1)
    expect(createConnection).toHaveBeenCalledWith({ host: HOST, port: PORT })
    expect(lastSocket().write).not.toHaveBeenCalled()
  })

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

  it('readDtcCodes: mock responde "43 03 01 04 01" → [P0301, P0401] con descripcion', async () => {
    const repo = makeRepo()
    const promise = repo.readDtcCodes()
    expectSent('03')
    respond(RESPONSES['03'])
    const dtcs = await promise
    expect(dtcs).toEqual([
      { code: 'P0301', description: 'Cylinder 1 Misfire Detected' },
      { code: 'P0401', description: 'Exhaust Gas Recirculation Flow Insufficient Detected' },
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

  it('getFreezeFrame: lee 5 PIDs Mode 02 y devuelve frame con todos los valores', async () => {
    const repo = makeRepo(100)
    const promise = repo.getFreezeFrame('P0301')

    await vi.waitFor(() => {
      expect(lastSocket().write).toHaveBeenCalledTimes(1)
    })
    respond(RESPONSES['02 04'])
    await vi.waitFor(() => {
      expect(lastSocket().write).toHaveBeenCalledTimes(2)
    })
    respond(RESPONSES['02 05'])
    await vi.waitFor(() => {
      expect(lastSocket().write).toHaveBeenCalledTimes(3)
    })
    respond(RESPONSES['02 0C'])
    await vi.waitFor(() => {
      expect(lastSocket().write).toHaveBeenCalledTimes(4)
    })
    respond(RESPONSES['02 0D'])
    await vi.waitFor(() => {
      expect(lastSocket().write).toHaveBeenCalledTimes(5)
    })
    respond(RESPONSES['02 11'])

    const frame = await promise
    expect(frame).toEqual({
      dtcCode: 'P0301',
      pidValues: { '04': 18.03921568627451, '05': 90, '0C': 800, '0D': 0, '11': 14.117647058823529 },
    })
  })

  it('getFreezeFrame: un PID que falla (NO DATA) no invalida el resto', async () => {
    const repo = makeRepo(100)
    const promise = repo.getFreezeFrame()

    await vi.waitFor(() => expect(lastSocket().write).toHaveBeenCalledTimes(1))
    respond(RESPONSES['02 04'])
    await vi.waitFor(() => expect(lastSocket().write).toHaveBeenCalledTimes(2))
    respond('NO DATA\r\r>')
    await vi.waitFor(() => expect(lastSocket().write).toHaveBeenCalledTimes(3))
    respond(RESPONSES['02 0C'])
    await vi.waitFor(() => expect(lastSocket().write).toHaveBeenCalledTimes(4))
    respond('NO DATA\r\r>')
    await vi.waitFor(() => expect(lastSocket().write).toHaveBeenCalledTimes(5))
    respond(RESPONSES['02 11'])

    const frame = await promise
    expect(frame).toEqual({
      dtcCode: 'UNKNOWN',
      pidValues: { '04': 18.03921568627451, '0C': 800, '11': 14.117647058823529 },
    })
  })

  it('getFreezeFrame: devuelve null si ningun PID responde', async () => {
    const repo = makeRepo(100)
    const promise = repo.getFreezeFrame('P0401')

    for (let i = 1; i <= 5; i++) {
      await vi.waitFor(() => expect(lastSocket().write).toHaveBeenCalledTimes(i))
      respond('NO DATA\r\r>')
    }

    await expect(promise).resolves.toBeNull()
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
    // timeout corto: la auto-reconexión reintenta el comando y el reintento agota
    // el timeout por comando — la aserción (rechazo Elm327ConnectionError) no cambia
    const repo = makeRepo(10)
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

  it('close(): destruye el socket y rechaza los comandos pendientes con Elm327ConnectionError', async () => {
    const repo = makeRepo()
    const socket = lastSocket()

    const pending = repo.readPid('01', '0C')
    expectSent('01 0C')

    await repo.close()

    expect(socket.destroy).toHaveBeenCalled()
    await expect(pending).rejects.toMatchObject({
      name: 'Elm327ConnectionError',
      message: expect.stringContaining('Connection closed'),
    })
  })

  it('tras close(): nuevos sendCommand no crean conexiones nuevas', async () => {
    const repo = makeRepo()
    expect(createConnection).toHaveBeenCalledTimes(1)

    await repo.close()

    const pending = repo.readPid('01', '0D')
    await expect(pending).rejects.toMatchObject({
      name: 'Elm327ConnectionError',
      message: expect.stringContaining('Connection closed'),
    })
    expect(createConnection).toHaveBeenCalledTimes(1)
  })

  it('getEcuInfo should return synthetic Engine Control Unit with OBD-II addresses', async () => {
    const repo = makeRepo()

    const ecus = await repo.getEcuInfo()

    expect(ecus).toHaveLength(1)
    expect(ecus[0]).toBeInstanceOf(EcuInfo)
    expect(ecus[0].name).toBe('Engine Control Unit')
    expect(ecus[0].requestAddr).toBe('7E0')
    expect(ecus[0].responseAddr).toBe('7E8')
    expect(ecus[0].type).toBe('ECM')
    expect(ecus[0].protocol).toBe('ISO 15765-4 (CAN 11/500)')
  })

  describe('readPidRaw', () => {
    // 22 F4 0C no esta en ALL_SEED_PIDS: es justo el caso que motiva el metodo, un PID
    // descubierto cuya formula no conoce el catalogo interno del adaptador.
    it('devuelve los bytes crudos de un PID Mode 22 fuera del catalogo semilla', async () => {
      const repo = makeRepo()

      const promise = repo.readPidRaw('22', 'F40C', 2)
      expectSent('22 F4 0C')
      respond('22 F4 0C\r62 F4 0C 0C 80 \r\r>')

      await expect(promise).resolves.toEqual([0x0c, 0x80])
    })

    it('acota la respuesta Mode 22 a los dataBytes pedidos', async () => {
      const repo = makeRepo()

      const promise = repo.readPidRaw('22', 'F40C', 1)
      respond('22 F4 0C\r62 F4 0C 0C 80 \r\r>')

      await expect(promise).resolves.toEqual([0x0c])
    })

    it('devuelve los bytes de datos sin aplicar la formula en Mode 01', async () => {
      const repo = makeRepo()

      // readPid('01','0C') daria 800; readPidRaw devuelve los bytes tal cual.
      const promise = repo.readPidRaw('01', '0C', 2)
      expectSent('01 0C')
      respond(RESPONSES['01 0C'])

      await expect(promise).resolves.toEqual([0x0c, 0x80])
    })
  })
})
