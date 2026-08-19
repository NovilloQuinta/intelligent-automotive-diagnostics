import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createConnection } from 'node:net'
import { createElm327TcpClient } from '@/infrastructure/elm327/tcpTransport.js'
import {
  Elm327TcpRepository,
  Elm327BusError,
  Elm327ConnectionError,
  Elm327NoDataError,
  Elm327ParseError,
} from '@/infrastructure/elm327/elm327Adapter.js'
import type { VehicleRepository } from '@/application/ports/VehicleRepository.js'
import { PidDefinition } from '@/domain/entities/pidDefinition.js'
import { PidCode } from '@/domain/value-objects/pidCode.js'
import { UnsafeObdModeError } from '@/domain/obdServiceMode.js'
import { VehicleStatus } from '@/domain/value-objects/vehicleStatus.js'

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

function mockVehicleRepo(overrides: Partial<VehicleRepository> = {}): VehicleRepository {
  return {
    upsertVehicle: vi.fn(),
    findVehicleByVin: vi.fn(),
    insertEcu: vi.fn(),
    findEcusByVehicle: vi.fn(),
    insertPidDefinition: vi.fn(),
    findPidDefinition: vi.fn().mockResolvedValue(null),
    findPidsByManufacturerModel: vi.fn().mockResolvedValue([]),
    findPidsByMode: vi.fn(),
    insertPidReading: vi.fn(),
    createSession: vi.fn(),
    endSession: vi.fn(),
    findSessions: vi.fn(),
    findSessionById: vi.fn(),
    findDtcDefinition: vi.fn(),
    upsertDtcDefinition: vi.fn(),
    findDtcDefinitionByCode: vi.fn().mockResolvedValue(null),
    findEcuByAddress: vi.fn(),
    updateEcuDiscoveredAt: vi.fn(),
    findEcuDefinitionByAddress: vi.fn().mockResolvedValue(null),
    upsertEcuDefinition: vi.fn(),
    ...overrides,
  }
}

const VAG_RPM_DID = new PidDefinition({
  id: 1,
  pidCode: new PidCode('22', '1130'),
  name: 'Engine Speed',
  formula: '(A*256+B)/4',
  unit: 'rpm',
  dataBytes: 2,
  pidType: 'formula',
  confidence: 1.0,
  source: 'seed',
})

const VAG_COOLANT_DID = new PidDefinition({
  id: 2,
  pidCode: new PidCode('22', 'F430'),
  name: 'Coolant Temperature',
  formula: 'A',
  unit: '°C',
  dataBytes: 1,
  pidType: 'formula',
  confidence: 1.0,
  source: 'seed',
})

function makeRepo(timeout?: number, vehicleRepo?: VehicleRepository): Elm327TcpRepository {
  const transport = createElm327TcpClient({ host: HOST, port: PORT, timeout, maxRetries: 0 })
  return new Elm327TcpRepository(transport, vehicleRepo)
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

/**
 * Guiona una lectura de DTC sobre el socket: `AT H1`, el modo y `AT H0`.
 *
 * Los codigos se leen con las cabeceras activas para saber que ECU los reporta, y
 * se apagan al terminar, asi que el modo ya no es el primer comando del socket.
 */
async function driveDtcRead(promise: Promise<unknown>, mode: string, answer: string) {
  await vi.waitFor(() => expectSent('AT H1'))
  respond('OK\r>')
  await vi.waitFor(() => expectSent(mode))
  respond(answer)
  await vi.waitFor(() => expectSent('AT H0'))
  respond('OK\r>')
  return promise
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
  '01 01': '01 01\r41 01 83 07 E0 FF\r\r>',
  '07': '07\r47 03 01 04 01\r\r>',
  '0A': '0A\r4A 03 01 04 01\r\r>',
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

  it('readPid Mode 22 VAG: resuelve formula desde BD via vehicleRepo → 800', async () => {
    const vRepo = mockVehicleRepo({ findPidDefinition: vi.fn().mockResolvedValue(VAG_RPM_DID) })
    const repo = makeRepo(undefined, vRepo)
    const promise = repo.readPid('22', '1130')
    await vi.waitFor(() => expectSent('22 11 30'))
    respond(RESPONSES['22 11 30'])
    await expect(promise).resolves.toBe(800)
  })

  it('readPid Mode 22 VAG coolant: resuelve formula desde BD via vehicleRepo → 90', async () => {
    const vRepo = mockVehicleRepo({ findPidDefinition: vi.fn().mockResolvedValue(VAG_COOLANT_DID) })
    const repo = makeRepo(undefined, vRepo)
    const promise = repo.readPid('22', 'F430')
    await vi.waitFor(() => expectSent('22 F4 30'))
    respond(RESPONSES['22 F4 30'])
    await expect(promise).resolves.toBe(90)
  })

  it('readPid Mode 22 sin vehicleRepo: fallback big-endian sobre los bytes', async () => {
    const repo = makeRepo()
    const promise = repo.readPid('22', '1130')
    expectSent('22 11 30')
    respond(RESPONSES['22 11 30'])
    await expect(promise).resolves.toBe(3200)
  })

  it('readPid Mode 22 con vehicleRepo sin definicion: fallback big-endian', async () => {
    const repo = makeRepo(undefined, mockVehicleRepo())
    const promise = repo.readPid('22', '1130')
    await vi.waitFor(() => expectSent('22 11 30'))
    respond(RESPONSES['22 11 30'])
    await expect(promise).resolves.toBe(3200)
  })

  it('readPid normaliza mode/pid a mayusculas antes de consultar la BD', async () => {
    const findPidDefinition = vi.fn().mockResolvedValue(VAG_COOLANT_DID)
    const vRepo = mockVehicleRepo({ findPidDefinition })
    const repo = makeRepo(undefined, vRepo)

    const promise = repo.readPid('22', 'f430')
    await vi.waitFor(() => expectSent('22 F4 30'))
    respond(RESPONSES['22 F4 30'])

    await expect(promise).resolves.toBe(90)
    expect(findPidDefinition).toHaveBeenCalledWith('22', 'F430')
  })

  describe('readPids', () => {
    it('lee cada PID secuencialmente (un comando por PID) y devuelve un Map PID → valor físico', async () => {
      const repo = makeRepo()
      const promise = repo.readPids('01', ['0C', '0D'])

      await vi.waitFor(() => expect(lastSocket().write).toHaveBeenCalledTimes(1))
      respond(RESPONSES['01 0C'])

      await vi.waitFor(() => expect(lastSocket().write).toHaveBeenCalledTimes(2))
      respond(RESPONSES['01 0D'])

      await expect(promise).resolves.toEqual(
        new Map([
          ['0C', 800],
          ['0D', 0],
        ]),
      )
    })

    it('omite del Map un PID que responde NO DATA, manteniendo el resto', async () => {
      const repo = makeRepo()
      const promise = repo.readPids('01', ['0C', '05', '0D'])

      await vi.waitFor(() => expect(lastSocket().write).toHaveBeenCalledTimes(1))
      respond(RESPONSES['01 0C'])

      await vi.waitFor(() => expect(lastSocket().write).toHaveBeenCalledTimes(2))
      respond('NO DATA\r\r>')

      await vi.waitFor(() => expect(lastSocket().write).toHaveBeenCalledTimes(3))
      respond(RESPONSES['01 0D'])

      await expect(promise).resolves.toEqual(
        new Map([
          ['0C', 800],
          ['0D', 0],
        ]),
      )
    })
  })

  it('readDtcCodes: mock responde "43 03 01 04 01" → [P0301, P0401] con descripcion', async () => {
    const repo = makeRepo()
    const dtcs = (await driveDtcRead(repo.readDtcCodes(), '03', RESPONSES['03'])) as Awaited<
      ReturnType<typeof repo.readDtcCodes>
    >
    expect(dtcs).toEqual([
      { code: 'P0301', description: 'Cylinder 1 Misfire Detected' },
      { code: 'P0401', description: 'Exhaust Gas Recirculation Flow Insufficient Detected' },
    ])
  })

  it('readDtcCodes: mock responde "NO DATA" → []', async () => {
    const repo = makeRepo()
    const promise = driveDtcRead(repo.readDtcCodes(), '03', 'NO DATA\r\r>') as ReturnType<
      typeof repo.readDtcCodes
    >
    await expect(promise).resolves.toEqual([])
  })

  it('readDtcCodes: DTC manufacturer-specific resuelve descripcion desde BD', async () => {
    const vRepo = mockVehicleRepo({
      findDtcDefinitionByCode: vi.fn().mockResolvedValue({
        manufacturer: 'Audi',
        model: 'A3',
        code: 'P2002',
        description: 'Diesel Particulate Filter Efficiency Below Threshold (Bank 1)',
        confidence: 0.9,
        source: 'seed',
      }),
    })
    const repo = makeRepo(undefined, vRepo)
    const promise = driveDtcRead(repo.readDtcCodes(), '03', '03\r43 20 02\r\r>') as ReturnType<
      typeof repo.readDtcCodes
    >
    const dtcs = await promise
    expect(dtcs).toEqual([
      {
        code: 'P2002',
        description: 'Diesel Particulate Filter Efficiency Below Threshold (Bank 1)',
      },
    ])
  })

  it('readDtcCodes: DTC manufacturer-specific sin vehicleRepo → description vacia', async () => {
    const repo = makeRepo()
    const promise = driveDtcRead(repo.readDtcCodes(), '03', '03\r43 20 02\r\r>') as ReturnType<
      typeof repo.readDtcCodes
    >
    const dtcs = await promise
    expect(dtcs).toEqual([{ code: 'P2002', description: '' }])
  })

  it('readPendingDtcCodes: mock responde "47 03 01 04 01" → [P0301, P0401] con descripcion', async () => {
    const repo = makeRepo()
    const promise = driveDtcRead(repo.readPendingDtcCodes(), '07', RESPONSES['07']) as ReturnType<
      typeof repo.readPendingDtcCodes
    >
    const dtcs = await promise
    expect(dtcs).toEqual([
      { code: 'P0301', description: 'Cylinder 1 Misfire Detected' },
      { code: 'P0401', description: 'Exhaust Gas Recirculation Flow Insufficient Detected' },
    ])
  })

  it('readPendingDtcCodes: mock responde "NO DATA" → []', async () => {
    const repo = makeRepo()
    const promise = driveDtcRead(repo.readPendingDtcCodes(), '07', 'NO DATA\r\r>') as ReturnType<
      typeof repo.readPendingDtcCodes
    >
    await expect(promise).resolves.toEqual([])
  })

  it('readPermanentDtcCodes: mock responde "4A 03 01 04 01" → [P0301, P0401] con descripcion', async () => {
    const repo = makeRepo()
    const promise = driveDtcRead(repo.readPermanentDtcCodes(), '0A', RESPONSES['0A']) as ReturnType<
      typeof repo.readPermanentDtcCodes
    >
    const dtcs = await promise
    expect(dtcs).toEqual([
      { code: 'P0301', description: 'Cylinder 1 Misfire Detected' },
      { code: 'P0401', description: 'Exhaust Gas Recirculation Flow Insufficient Detected' },
    ])
  })

  it('readPermanentDtcCodes: mock responde "NO DATA" → []', async () => {
    const repo = makeRepo()
    const promise = driveDtcRead(repo.readPermanentDtcCodes(), '0A', 'NO DATA\r\r>') as ReturnType<
      typeof repo.readPermanentDtcCodes
    >
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
      pidValues: {
        '04': 18.03921568627451,
        '05': 90,
        '0C': 800,
        '0D': 0,
        '11': 14.117647058823529,
      },
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

  it('getFreezeFrame: trata dtc vacío como UNKNOWN', async () => {
    const repo = makeRepo(100)
    const promise = repo.getFreezeFrame('')

    await vi.waitFor(() => expect(lastSocket().write).toHaveBeenCalledTimes(1))
    respond(RESPONSES['02 04'])
    await vi.waitFor(() => expect(lastSocket().write).toHaveBeenCalledTimes(2))
    respond('NO DATA\r\r>')
    await vi.waitFor(() => expect(lastSocket().write).toHaveBeenCalledTimes(3))
    respond('NO DATA\r\r>')
    await vi.waitFor(() => expect(lastSocket().write).toHaveBeenCalledTimes(4))
    respond('NO DATA\r\r>')
    await vi.waitFor(() => expect(lastSocket().write).toHaveBeenCalledTimes(5))
    respond('NO DATA\r\r>')

    const frame = await promise
    expect(frame).toEqual({
      dtcCode: 'UNKNOWN',
      pidValues: { '04': 18.03921568627451 },
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

  it('getVehicleInfo: lee el VIN y deja la marca sin resolver', async () => {
    // El adaptador es el borde del sistema: sabe leer el bus, no consultar el
    // catalogo. La marca la resuelve `ResolveVehicleIdentityUseCase`, que si
    // puede aprender un WMI nuevo — antes esto salia de una tabla en codigo que
    // dejaba `unknown` cualquier fabricante no previsto.
    const repo = makeRepo()
    const promise = repo.getVehicleInfo()
    expectSent('09 02')
    respond(RESPONSES['09 02'])
    const info = await promise
    expect(info.make).toBe('unknown')
    expect(info.model).toBe('unknown')
    // El anio si: es regla posicional de la ISO 3779, no una consulta de datos.
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
    respond('ZZ ZZ ZZ\r\r>')
    await expect(promise).rejects.toBeInstanceOf(Elm327ParseError)
  })

  it('Fallo del bus: mock responde CAN ERROR → Elm327BusError con mensaje accionable', async () => {
    const repo = makeRepo()
    const promise = repo.readPid('01', '0C')
    expectSent('01 0C')
    respond('CAN ERROR\r\r>')
    await expect(promise).rejects.toBeInstanceOf(Elm327BusError)
    await expect(promise).rejects.toThrow(/CAN/i)
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

  it('getEcuInfo delega en discoverEcus: emite secuencia AT + 01 00, restaura el estado y devuelve la ECU descubierta', async () => {
    const repo = makeRepo(100)
    const promise = repo.getEcuInfo()

    // El primer comando ya no configura nada: pregunta que protocolo se negocio.
    await vi.waitFor(() => expect(lastSocket().write).toHaveBeenCalledTimes(1))
    respond('A6\r\r>')
    for (let i = 2; i <= 5; i++) {
      await vi.waitFor(() => expect(lastSocket().write).toHaveBeenCalledTimes(i))
      respond('OK\r>')
    }
    await vi.waitFor(() => expect(lastSocket().write).toHaveBeenCalledTimes(6))
    respond('7E8 06 41 00 BE 3F A8 13\r>')
    await vi.waitFor(() => expect(lastSocket().write).toHaveBeenCalledTimes(7))
    respond('OK\r>')
    await vi.waitFor(() => expect(lastSocket().write).toHaveBeenCalledTimes(8))
    respond('OK\r>')

    const ecus = await promise
    expect(ecus).toMatchObject([
      {
        id: 0,
        vehicleId: 0,
        name: 'Engine Control Module',
        requestAddr: '7E0',
        responseAddr: '7E8',
        type: 'ECM',
        protocol: 'CAN_11_500',
      },
    ])
    expect(lastSocket().write.mock.calls.map((call) => call[0])).toEqual([
      'AT DPN\r\n',
      'AT E0\r\n',
      'AT L0\r\n',
      'AT H1\r\n',
      'AT SH 7DF\r\n',
      '01 00\r\n',
      'AT H0\r\n',
      'AT SH 7E0\r\n',
    ])
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

  describe('getVehicleStatus', () => {
    it('should send 01 01 and parse MIL + monitor status bytes', async () => {
      const repo = makeRepo()
      const promise = repo.getVehicleStatus()
      expectSent('01 01')
      respond(RESPONSES['01 01'])
      const status = await promise

      expect(status).toBeInstanceOf(VehicleStatus)
      expect(status.milOn).toBe(true)
      expect(status.dtcCount).toBe(3)
      expect(status.engineType).toBe('spark')
      expect(status.monitors.length).toBe(11)
    })

    it('should throw Elm327ParseError on malformed response', async () => {
      const repo = makeRepo()
      const promise = repo.getVehicleStatus()
      expectSent('01 01')
      respond('ZZ ZZ ZZ\r\r>')
      await expect(promise).rejects.toBeInstanceOf(Elm327ParseError)
    })
  })

  describe('safety guard', () => {
    /** Crea un repositorio con la politica de solo-lectura activada. */
    function makeReadOnlyRepo(): Elm327TcpRepository {
      const transport = createElm327TcpClient({ host: HOST, port: PORT, maxRetries: 0 })
      return new Elm327TcpRepository(transport, undefined, undefined, { readOnly: true })
    }

    it.each(['2F', '31', '11', '2E', '10', '27', '34', '85', '04', '08'])(
      'should reject readPid with control mode %s without writing to the bus',
      async (mode) => {
        const repo = makeRepo()

        await expect(repo.readPid(mode, '01')).rejects.toBeInstanceOf(UnsafeObdModeError)
        expect(lastSocket().write).not.toHaveBeenCalled()
      },
    )

    it('should reject readPidRaw with a control mode without writing to the bus', async () => {
      const repo = makeRepo()

      await expect(repo.readPidRaw('2F', '01', 2)).rejects.toBeInstanceOf(UnsafeObdModeError)
      expect(lastSocket().write).not.toHaveBeenCalled()
    })

    it('should reject a transposed mode/pid before it reaches the vehicle', async () => {
      const repo = makeRepo()

      // {mode:"2F", pid:"01"} es la transposicion de {mode:"01", pid:"2F"}:
      // nivel de combustible como PID, control de actuadores como modo.
      await expect(repo.readPid('2F', '01')).rejects.toThrow(/mode "01"/)
      expect(lastSocket().write).not.toHaveBeenCalled()
    })

    it('should still allow reads on Mode 01 with PID 2F', async () => {
      const repo = makeRepo()

      const promise = repo.readPid('01', '2F')
      expectSent('01 2F')
      respond('01 2F\r41 2F 7F \r\r>')

      await expect(promise).resolves.toBeCloseTo(49.8, 1)
    })

    it('should still allow reads on Mode 22 (UDS ReadDataByIdentifier)', async () => {
      const vRepo = mockVehicleRepo({ findPidDefinition: vi.fn().mockResolvedValue(VAG_RPM_DID) })
      const repo = makeRepo(undefined, vRepo)

      const promise = repo.readPid('22', '1130')
      await vi.waitFor(() => expectSent('22 11 30'))
      respond(RESPONSES['22 11 30'])

      await expect(promise).resolves.toBe(800)
    })

    it('should send Mode 04 from clearDtcCodes by default', async () => {
      const repo = makeRepo()

      const promise = repo.clearDtcCodes()
      expectSent('04')
      respond('04\r44\r\r>')

      await expect(promise).resolves.toBeUndefined()
    })

    it('should block clearDtcCodes when the repository is read-only', async () => {
      const repo = makeReadOnlyRepo()

      await expect(repo.clearDtcCodes()).rejects.toBeInstanceOf(UnsafeObdModeError)
      expect(lastSocket().write).not.toHaveBeenCalled()
    })
  })
})

describe('lectura de DTC con origen', () => {
  /** Transporte guionizado que registra los comandos, como el de `ecuDiscovery.test.ts`. */
  function createScriptedTransport(script: Record<string, string>): {
    transport: Elm327Transport
    sent: string[]
  } {
    const sent: string[] = []
    const transport: Elm327Transport = {
      connect: vi.fn().mockResolvedValue(undefined),
      sendCommand: vi.fn(async (cmd: string) => {
        sent.push(cmd)
        return script[cmd] ?? 'OK\r>'
      }),
      runExclusive: (fn) => fn({ sendCommand: (cmd) => transport.sendCommand(cmd) }),
      close: vi.fn().mockResolvedValue(undefined),
    }
    return { transport, sent }
  }

  it('should read stored DTCs with headers on and restore them afterwards', async () => {
    const { transport, sent } = createScriptedTransport({
      '03': '7E8 07 43 03 01 04 01 20 02\r>',
    })
    const repo = new Elm327TcpRepository(transport)

    const dtcs = await repo.readDtcCodes()

    expect(sent).toEqual(['AT H1', '03', 'AT H0'])
    expect(dtcs.map((d) => d.code)).toEqual(['P0301', 'P0401', 'P2002'])
    expect(dtcs.every((d) => d.ecuAddress === '7E8')).toBe(true)
  })

  it('should attribute each code to the ECU that reports it', async () => {
    const { transport } = createScriptedTransport({
      '03': '7E8 07 43 03 01\r7E9 04 43 04 01\r>',
    })
    const repo = new Elm327TcpRepository(transport)

    const dtcs = await repo.readDtcCodes()

    expect(dtcs.map((d) => [d.code, d.ecuAddress])).toEqual([
      ['P0301', '7E8'],
      ['P0401', '7E9'],
    ])
  })

  it('should restore the headers even if the read throws', async () => {
    const sent: string[] = []
    const transport: Elm327Transport = {
      connect: vi.fn().mockResolvedValue(undefined),
      sendCommand: vi.fn(async (cmd: string) => {
        sent.push(cmd)
        if (cmd === '03') throw new Error('bus unavailable')
        return 'OK\r>'
      }),
      runExclusive: (fn) => fn({ sendCommand: (cmd) => transport.sendCommand(cmd) }),
      close: vi.fn().mockResolvedValue(undefined),
    }
    const repo = new Elm327TcpRepository(transport)

    await expect(repo.readDtcCodes()).rejects.toThrow('bus unavailable')
    expect(sent).toEqual(['AT H1', '03', 'AT H0'])
  })

  it('should keep codes without origin when the bus returns no headers', async () => {
    const { transport } = createScriptedTransport({ '03': '43 03 01\r>' })
    const repo = new Elm327TcpRepository(transport)

    const dtcs = await repo.readDtcCodes()

    expect(dtcs[0].code).toBe('P0301')
    expect(dtcs[0].ecuAddress).toBeUndefined()
  })

  it('should use the pending and permanent modes with the same protocol', async () => {
    const pending = createScriptedTransport({ '07': '7E8 04 47 04 01\r>' })
    const permanent = createScriptedTransport({ '0A': '7E8 04 4A 20 02\r>' })

    expect((await new Elm327TcpRepository(pending.transport).readPendingDtcCodes())[0].code).toBe(
      'P0401',
    )
    expect(pending.sent).toEqual(['AT H1', '07', 'AT H0'])
    expect(
      (await new Elm327TcpRepository(permanent.transport).readPermanentDtcCodes())[0].code,
    ).toBe('P2002')
    expect(permanent.sent).toEqual(['AT H1', '0A', 'AT H0'])
  })
})
