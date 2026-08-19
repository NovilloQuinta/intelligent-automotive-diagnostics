import { describe, it, expect, vi } from 'vitest'
import { discoverEcus } from '@/infrastructure/elm327/ecuDiscovery.js'
import type { Elm327TransportPort } from '@/application/ports/Elm327TransportPort.js'

/** Consulta del protocolo ya negociado. Primer comando del barrido, siempre. */
const PROTOCOL_QUERY = 'AT DPN'

/** Secuencia AT del barrido en CAN de 11 bits, tras conocer el protocolo. */
const SCAN_11_BIT = ['AT E0', 'AT L0', 'AT H1', 'AT SH 7DF']

/**
 * Restauración tras el barrido: headers off y la dirección **física** del ECM.
 *
 * No la funcional. Verificado contra el ELM327-emulator: con `AT SH 7DF` puesto,
 * un `01 0C` responde `NO DATA` — la dirección de broadcast sirve para preguntar
 * quién hay en el bus, no para leer PIDs. Dejarla puesta tumba la telemetría.
 */
const RESTORE_11_BIT = ['AT H0', 'AT SH 7E0']

const SCAN_29_BIT = ['AT E0', 'AT L0', 'AT H1', 'AT SH 18DB33F1']
const RESTORE_29_BIT = ['AT H0', 'AT SH 18DA10F1']

/** Respuesta por defecto de `AT DPN`: CAN 11 bits / 500 kbps negociado en automático. */
const CAN_11_500 = 'A6\r\r>'

/** Transporte de prueba que guiona respuestas por comando y registra los comandos emitidos. */
function createScriptedTransport(script: Record<string, string>): {
  transport: Elm327TransportPort
  sent: string[]
} {
  const sent: string[] = []
  const answers = { [PROTOCOL_QUERY]: CAN_11_500, ...script }
  const transport: Elm327TransportPort = {
    connect: vi.fn().mockResolvedValue(undefined),
    sendCommand: vi.fn(async (cmd: string) => {
      sent.push(cmd)
      return answers[cmd] ?? ''
    }),
    runExclusive: (fn) => fn({ sendCommand: (cmd) => transport.sendCommand(cmd) }),
    close: vi.fn().mockResolvedValue(undefined),
  }
  return { transport, sent }
}

/** Transporte de prueba que lanza al recibir un comando concreto y registra todo lo emitido. */
function createThrowingTransport(throwingCommand: string): {
  transport: Elm327TransportPort
  sent: string[]
} {
  const sent: string[] = []
  const transport: Elm327TransportPort = {
    connect: vi.fn().mockResolvedValue(undefined),
    sendCommand: vi.fn(async (cmd: string) => {
      sent.push(cmd)
      if (cmd === throwingCommand) throw new Error('bus unavailable')
      return cmd === PROTOCOL_QUERY ? CAN_11_500 : 'OK\r>'
    }),
    runExclusive: (fn) => fn({ sendCommand: (cmd) => transport.sendCommand(cmd) }),
    close: vi.fn().mockResolvedValue(undefined),
  }
  return { transport, sent }
}

const DISCOVERED_PROTOCOL = 'CAN_11_500'

describe('discoverEcus', () => {
  it('should ask for the negotiated protocol before configuring anything', async () => {
    const { transport, sent } = createScriptedTransport({
      '01 00': '7E8 06 41 00 BE 3F A8 13\r>',
    })

    await discoverEcus(transport)

    expect(sent[0]).toBe(PROTOCOL_QUERY)
    expect(sent).not.toContain('AT SP 6')
    expect(sent.some((cmd) => cmd.startsWith('AT SP'))).toBe(false)
  })

  it('should emit the AT sequence, the broadcast and the restore in order', async () => {
    const { transport, sent } = createScriptedTransport({
      '01 00': '7E8 06 41 00 BE 3F A8 13\r>',
    })

    await discoverEcus(transport)

    expect(sent).toEqual([PROTOCOL_QUERY, ...SCAN_11_BIT, '01 00', ...RESTORE_11_BIT])
  })

  it('should map a multi-ECU broadcast (7E8/7E9/7EA) to 3 resolved EcuInfo', async () => {
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

  it('should fall back to physical addressing and return 1 ECM when the broadcast is empty', async () => {
    const { transport, sent } = createScriptedTransport({
      '01 00': '\r>',
      '09 0A': '49 0A 01 45 43 4D\r>',
    })

    const ecus = await discoverEcus(transport)

    expect(sent).toEqual([
      PROTOCOL_QUERY,
      ...SCAN_11_BIT,
      '01 00',
      'AT SH 7E0',
      '09 0A',
      ...RESTORE_11_BIT,
    ])
    expect(ecus).toMatchObject([
      {
        name: 'Engine Control Module',
        requestAddr: '7E0',
        responseAddr: '7E8',
        type: 'ECM',
        protocol: DISCOVERED_PROTOCOL,
      },
    ])
  })

  it.each([
    ['NO DATA', 'NO DATA\r>'],
    ['empty', '\r>'],
    ['CAN ERROR', 'CAN ERROR\r\r>'],
    ['?', '?\r\r>'],
  ])('should return [] when broadcast and 09 0A answer %s', async (_label, answer) => {
    const { transport } = createScriptedTransport({ '01 00': answer, '09 0A': answer })

    await expect(discoverEcus(transport)).resolves.toEqual([])
  })

  it('should restore the ELM327 state even if the broadcast throws', async () => {
    const { transport, sent } = createThrowingTransport('01 00')

    await expect(discoverEcus(transport)).rejects.toThrow('bus unavailable')

    expect(sent).toEqual([PROTOCOL_QUERY, ...SCAN_11_BIT, '01 00', ...RESTORE_11_BIT])
  })

  it('should restore the ELM327 state even if the 09 0A fallback throws', async () => {
    const { transport, sent } = createThrowingTransport('09 0A')

    await expect(discoverEcus(transport)).rejects.toThrow('bus unavailable')

    expect(sent).toEqual([
      PROTOCOL_QUERY,
      ...SCAN_11_BIT,
      '01 00',
      'AT SH 7E0',
      '09 0A',
      ...RESTORE_11_BIT,
    ])
  })

  describe('when the vehicle does not speak CAN', () => {
    it.each([
      ['3', 'ISO 9141-2'],
      ['5', 'ISO 14230-4 KWP fast init'],
      ['1', 'SAE J1850 PWM'],
    ])('should abstain on protocol %s (%s) without touching the adapter', async (dpn) => {
      const { transport, sent } = createScriptedTransport({ [PROTOCOL_QUERY]: `A${dpn}\r>` })

      await expect(discoverEcus(transport)).resolves.toEqual([])

      // La aserción que blinda el bug: nada más sale al bus. Ni un `AT SH`, ni un
      // `AT H1`, ni un `AT SP`. Las lecturas siguientes encuentran el adaptador
      // exactamente como estaba.
      expect(sent).toEqual([PROTOCOL_QUERY])
    })

    it('should abstain when the protocol answer is unrecognizable', async () => {
      const { transport, sent } = createScriptedTransport({
        [PROTOCOL_QUERY]: 'BUS INIT: ERROR\r>',
      })

      await expect(discoverEcus(transport)).resolves.toEqual([])
      expect(sent).toEqual([PROTOCOL_QUERY])
    })
  })

  describe('on a 29-bit CAN bus', () => {
    it('should broadcast to the 29-bit functional address and resolve its responders', async () => {
      const { transport, sent } = createScriptedTransport({
        [PROTOCOL_QUERY]: 'A7\r>',
        '01 00': '18DAF110 06 41 00 BE 3F A8 13\r18DAF111 06 41 00 80 00 00 00\r>',
      })

      const ecus = await discoverEcus(transport)

      expect(sent).toEqual([PROTOCOL_QUERY, ...SCAN_29_BIT, '01 00', ...RESTORE_29_BIT])
      expect(ecus).toMatchObject([
        {
          name: 'Engine Control Module',
          requestAddr: '18DA10F1',
          responseAddr: '18DAF110',
          type: 'ECM',
          protocol: 'CAN_29_500',
        },
        {
          name: 'ECU 18DAF111',
          requestAddr: '18DA11F1',
          responseAddr: '18DAF111',
          type: 'UNKNOWN',
          protocol: 'CAN_29_500',
        },
      ])
    })

    it('should use the 29-bit physical address in the fallback', async () => {
      const { transport, sent } = createScriptedTransport({
        [PROTOCOL_QUERY]: 'A7\r>',
        '01 00': '\r>',
        '09 0A': '49 0A 01 45 43 4D\r>',
      })

      const ecus = await discoverEcus(transport)

      expect(sent).toContain('AT SH 18DA10F1')
      expect(ecus).toMatchObject([{ responseAddr: '18DAF110', requestAddr: '18DA10F1' }])
    })
  })

  it('should report the real bus, not a hardcoded one', async () => {
    const { transport } = createScriptedTransport({
      [PROTOCOL_QUERY]: 'A8\r>',
      '01 00': '7E8 06 41 00 BE 3F A8 13\r>',
    })

    const ecus = await discoverEcus(transport)

    expect(ecus[0].protocol).toBe('CAN_11_250')
  })
})
