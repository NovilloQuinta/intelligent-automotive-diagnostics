import { describe, it, expect, vi } from 'vitest'
import { discoverEcus } from '@/infrastructure/elm327/ecuDiscovery.js'
import type { Elm327Transport } from '@/application/ports/Elm327Transport.js'

const ECU_SCAN_INIT_SEQUENCE = ['AT E0', 'AT L0', 'AT H1', 'AT SP 6', 'AT SH 7DF']
const ECU_SCAN_RESTORE_SEQUENCE = ['AT H0', 'AT SH 7E0']

/** Transporte de prueba que guiona respuestas por comando y registra los comandos emitidos. */
function createScriptedTransport(script: Record<string, string>): {
  transport: Elm327Transport
  sent: string[]
} {
  const sent: string[] = []
  const transport: Elm327Transport = {
    connect: vi.fn().mockResolvedValue(undefined),
    sendCommand: vi.fn(async (cmd: string) => {
      sent.push(cmd)
      return script[cmd] ?? ''
    }),
    close: vi.fn().mockResolvedValue(undefined),
  }
  return { transport, sent }
}

/** Transporte de prueba que lanza al recibir un comando concreto y registra todo lo emitido. */
function createThrowingTransport(throwingCommand: string): {
  transport: Elm327Transport
  sent: string[]
} {
  const sent: string[] = []
  const transport: Elm327Transport = {
    connect: vi.fn().mockResolvedValue(undefined),
    sendCommand: vi.fn(async (cmd: string) => {
      sent.push(cmd)
      if (cmd === throwingCommand) throw new Error('bus unavailable')
      return 'OK\r>'
    }),
    close: vi.fn().mockResolvedValue(undefined),
  }
  return { transport, sent }
}

const DISCOVERED_PROTOCOL = 'CAN_11_500'

describe('discoverEcus', () => {
  it('emite la secuencia AT, el broadcast 01 00 y restaura el estado ELM327 en orden', async () => {
    const { transport, sent } = createScriptedTransport({
      '01 00': '7E8 06 41 00 BE 3F A8 13\r>',
    })

    await discoverEcus(transport)

    expect(sent).toEqual([...ECU_SCAN_INIT_SEQUENCE, '01 00', ...ECU_SCAN_RESTORE_SEQUENCE])
  })

  it('mapea un broadcast multi-ECU (7E8/7E9/7EA) a 3 EcuInfo resueltas', async () => {
    const { transport } = createScriptedTransport({
      '01 00': '7E8 06 41 00 BE 3F A8 13\r7E9 06 41 00 80 00 00 00\r7EA 06 41 00 00 00 00 00\r>',
    })

    const ecus = await discoverEcus(transport)

    expect(ecus).toMatchObject([
      {
        id: 0,
        vehicleId: 0,
        name: 'Engine Control Module',
        requestAddr: '7E0',
        responseAddr: '7E8',
        type: 'ECM',
        protocol: DISCOVERED_PROTOCOL,
      },
      {
        id: 0,
        vehicleId: 0,
        name: 'ECU 7E9',
        requestAddr: '7E1',
        responseAddr: '7E9',
        type: 'UNKNOWN',
        protocol: DISCOVERED_PROTOCOL,
      },
      {
        id: 0,
        vehicleId: 0,
        name: 'ECU 7EA',
        requestAddr: '7E2',
        responseAddr: '7EA',
        type: 'UNKNOWN',
        protocol: DISCOVERED_PROTOCOL,
      },
    ])
  })

  it('cae al fallback (AT SH 7E0 + 09 0A) y devuelve 1 ECM cuando el broadcast esta vacio', async () => {
    const { transport, sent } = createScriptedTransport({
      '01 00': '\r>',
      '09 0A': '49 0A 01 45 43 4D\r>',
    })

    const ecus = await discoverEcus(transport)

    expect(sent).toEqual([
      ...ECU_SCAN_INIT_SEQUENCE,
      '01 00',
      'AT SH 7E0',
      '09 0A',
      ...ECU_SCAN_RESTORE_SEQUENCE,
    ])
    expect(ecus).toMatchObject([
      {
        id: 0,
        vehicleId: 0,
        name: 'Engine Control Module',
        requestAddr: '7E0',
        responseAddr: '7E8',
        type: 'ECM',
        protocol: DISCOVERED_PROTOCOL,
      },
    ])
  })

  it('devuelve [] cuando broadcast y 09 0A responden NO DATA', async () => {
    const { transport } = createScriptedTransport({
      '01 00': 'NO DATA\r>',
      '09 0A': 'NO DATA\r>',
    })

    await expect(discoverEcus(transport)).resolves.toEqual([])
  })

  it('devuelve [] cuando broadcast y 09 0A responden vacio', async () => {
    const { transport } = createScriptedTransport({
      '01 00': '\r>',
      '09 0A': '\r>',
    })

    await expect(discoverEcus(transport)).resolves.toEqual([])
  })

  it('devuelve [] cuando 09 0A responde CAN ERROR', async () => {
    const { transport } = createScriptedTransport({
      '01 00': '\r>',
      '09 0A': 'CAN ERROR\r\r>',
    })

    await expect(discoverEcus(transport)).resolves.toEqual([])
  })

  it('devuelve [] cuando 09 0A responde ?', async () => {
    const { transport } = createScriptedTransport({
      '01 00': '\r>',
      '09 0A': '?\r\r>',
    })

    await expect(discoverEcus(transport)).resolves.toEqual([])
  })

  it('restaura el estado ELM327 aunque el broadcast lance', async () => {
    const { transport, sent } = createThrowingTransport('01 00')

    await expect(discoverEcus(transport)).rejects.toThrow('bus unavailable')

    expect(sent).toEqual([...ECU_SCAN_INIT_SEQUENCE, '01 00', ...ECU_SCAN_RESTORE_SEQUENCE])
  })

  it('restaura el estado ELM327 aunque el fallback 09 0A lance', async () => {
    const { transport, sent } = createThrowingTransport('09 0A')

    await expect(discoverEcus(transport)).rejects.toThrow('bus unavailable')

    expect(sent).toEqual([
      ...ECU_SCAN_INIT_SEQUENCE,
      '01 00',
      'AT SH 7E0',
      '09 0A',
      ...ECU_SCAN_RESTORE_SEQUENCE,
    ])
  })
})
