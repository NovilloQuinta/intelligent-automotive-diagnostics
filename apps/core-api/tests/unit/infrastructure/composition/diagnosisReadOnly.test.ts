import { describe, it, expect, vi } from 'vitest'
import type { Elm327Transport } from '@/application/ports/Elm327Transport.js'

/** Doble del transporte: la frontera de infraestructura, lo único que se mockea. */
function createStubTransport(): Elm327Transport {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    sendCommand: vi.fn().mockResolvedValue('OK\r>'),
    runExclusive: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  }
}

vi.mock('@/infrastructure/elm327/tcpTransport.js', () => ({
  createElm327TcpClient: vi.fn(() => createStubTransport()),
}))

vi.mock('@/infrastructure/elm327/serialTransport.js', () => ({
  createElm327SerialClient: vi.fn(() => createStubTransport()),
}))

import { createDiagnosisService } from '@/infrastructure/composition/diagnosis.js'
import type { AppConfig } from '@/infrastructure/configuration/index.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import type { VehicleRepository } from '@/application/ports/VehicleRepository.js'

function createLogger(): LoggerPort {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}

function createConfig(overrides: Partial<AppConfig>): AppConfig {
  return {
    OBD_MODE: 'docker',
    OBD_READ_ONLY: false,
    OBD_TRACE: false,
    ELM327_HOST: 'localhost',
    ELM327_PORT: 35000,
    ELM327_AUDI_HOST: 'localhost',
    ELM327_AUDI_PORT: 35000,
    ELM327_KAWASAKI_HOST: 'localhost',
    ELM327_KAWASAKI_PORT: 35001,
    ELM327_TOYOTA_HOST: 'localhost',
    ELM327_TOYOTA_PORT: 35002,
    SERIAL_PORT_PATH: '/dev/ttyUSB0',
    SERIAL_BAUD_RATE: 38400,
    ...overrides,
  } as AppConfig
}

function createService(overrides: Partial<AppConfig>) {
  return createDiagnosisService({
    config: createConfig(overrides),
    llmClient: undefined,
    knowledgeStack: undefined,
    webSearch: undefined,
    vehicleRepo: {} as VehicleRepository,
    logger: createLogger(),
  })
}

describe('createDiagnosisService — política de solo lectura', () => {
  it.each(['serial', 'tcp'] as const)(
    'should block clearing DTCs over a %s connection even when the flag is off',
    async (mode) => {
      const service = createService({ OBD_MODE: mode, OBD_READ_ONLY: false })

      await expect(service.clearDtcCodes()).rejects.toMatchObject({
        name: 'UnsafeObdModeError',
      })
    },
  )

  it('should explain that the connection mode is the cause, not the flag', async () => {
    const service = createService({ OBD_MODE: 'serial', OBD_READ_ONLY: false })

    await expect(service.clearDtcCodes()).rejects.toThrow(/OBD_MODE|conexi|connection/i)
  })

  it('should keep clearing DTCs available against the emulator', async () => {
    const service = createService({ OBD_MODE: 'docker', OBD_READ_ONLY: false })

    await expect(service.clearDtcCodes('audi-a3-tdi')).resolves.toBeUndefined()
  })

  it('should still honour the explicit flag against the emulator', async () => {
    const service = createService({ OBD_MODE: 'docker', OBD_READ_ONLY: true })

    await expect(service.clearDtcCodes('audi-a3-tdi')).rejects.toMatchObject({
      name: 'UnsafeObdModeError',
    })
  })
})
