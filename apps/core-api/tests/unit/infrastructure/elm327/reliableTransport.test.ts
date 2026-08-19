import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createReliableTransport,
  type TransportIoAdapter,
} from '@/infrastructure/elm327/reliableTransport.js'

/**
 * Conexión falsa: registra lo escrito y responde en el acto. El núcleo asigna
 * `activeCommand` antes de llamar a `write`, asi que responder de forma sincrona
 * dentro de `write` es seguro y evita depender de timers en el camino feliz.
 */
interface FakeConn {
  readonly id: number
  readonly written: string[]
}

interface FakeIo {
  readonly io: TransportIoAdapter<FakeConn>
  readonly conns: FakeConn[]
  /** Comandos enviados por la conexión activa, sin el terminador `\r\n`. */
  sentOn(connIndex: number): string[]
  /** Corta la conexión activa como si el cable se hubiera soltado. */
  dropConnection(): void
  /** Comandos que no reciben respuesta, para forzar el timeout. */
  silence(cmds: readonly string[]): void
}

function createFakeIo(): FakeIo {
  const conns: FakeConn[] = []
  const handlers = new Map<
    FakeConn,
    { onData(chunk: Buffer): void; onError(err: Error): void; onClose(): void }
  >()
  let silenced: readonly string[] = []
  let active: FakeConn | null = null

  const io: TransportIoAdapter<FakeConn> = {
    open: () => {
      const conn: FakeConn = { id: conns.length, written: [] }
      conns.push(conn)
      active = conn
      return conn
    },
    bind: (conn, h) => {
      handlers.set(conn, h)
    },
    write: (conn, payload) => {
      conn.written.push(payload)
      const cmd = payload.trim()
      if (silenced.includes(cmd)) return
      handlers.get(conn)?.onData(Buffer.from(`${cmd}\rOK\r\r>`))
    },
    destroy: () => {},
    shutdown: () => {},
    describeError: (err) => err.message,
    connectionErrorMessage: (detail) => `error ${detail}`,
    connectionClosedMessage: () => 'closed',
    notConnectedMessage: () => 'not connected',
    commandTimeoutMessage: (cmd, ms) => `timeout ${ms} on ${cmd}`,
  }

  return {
    io,
    conns,
    sentOn: (connIndex) => conns[connIndex].written.map((w) => w.trim()),
    dropConnection: () => {
      if (active !== null) handlers.get(active)?.onClose()
    },
    silence: (cmds) => {
      silenced = cmds
    },
  }
}

const BASE_CONFIG = { timeoutMs: 1000, maxRetries: 1, backoffMs: 1 }
const INIT = ['ATZ', 'ATE0', 'ATSP0'] as const

describe('createReliableTransport — secuencia de inicialización', () => {
  let fake: FakeIo

  beforeEach(() => {
    fake = createFakeIo()
  })

  it('envía los comandos de init antes del primer comando de datos', async () => {
    const transport = createReliableTransport(fake.io, {
      ...BASE_CONFIG,
      initCommands: INIT,
    })

    await transport.sendCommand('01 0C')

    expect(fake.sentOn(0)).toEqual(['ATZ', 'ATE0', 'ATSP0', '01 0C'])
  })

  it('no envía nada de init cuando no se configuran comandos — modo emulador', async () => {
    const transport = createReliableTransport(fake.io, BASE_CONFIG)

    await transport.sendCommand('01 0C')

    expect(fake.sentOn(0)).toEqual(['01 0C'])
  })

  it('no repite el init entre comandos de la misma conexión', async () => {
    const transport = createReliableTransport(fake.io, {
      ...BASE_CONFIG,
      initCommands: INIT,
    })

    await transport.sendCommand('01 0C')
    await transport.sendCommand('01 0D')

    expect(fake.sentOn(0)).toEqual(['ATZ', 'ATE0', 'ATSP0', '01 0C', '01 0D'])
  })

  it('reejecuta el init tras una reconexión — el adaptador pierde su estado al reiniciarse', async () => {
    const transport = createReliableTransport(fake.io, {
      ...BASE_CONFIG,
      initCommands: INIT,
    })
    await transport.sendCommand('01 0C')

    fake.dropConnection()
    // La reconexión va por backoff propio (100 ms de base), no por `backoffMs`.
    await new Promise((resolve) => setTimeout(resolve, 150))
    await transport.sendCommand('01 0D')

    expect(fake.conns).toHaveLength(2)
    expect(fake.sentOn(1)).toEqual(['ATZ', 'ATE0', 'ATSP0', '01 0D'])
  })

  it('no falla cuando no hay observador de traza configurado', async () => {
    const transport = createReliableTransport(fake.io, BASE_CONFIG)
    await expect(transport.sendCommand('01 0C')).resolves.toContain('OK')
  })

  it('notifica cada intercambio al observador de traza, init incluido', async () => {
    const seen: Array<{ cmd: string; raw?: string; error?: string }> = []
    const transport = createReliableTransport(fake.io, {
      ...BASE_CONFIG,
      initCommands: ['ATZ'],
      onTrace: (entry) => seen.push({ cmd: entry.cmd, raw: entry.raw, error: entry.error }),
    })

    await transport.sendCommand('01 0C')

    expect(seen.map((e) => e.cmd)).toEqual(['ATZ', '01 0C'])
    expect(seen[1].raw).toContain('OK')
    expect(seen[1].error).toBeUndefined()
  })

  it('notifica el fallo al observador cuando un comando no responde', async () => {
    vi.useFakeTimers()
    try {
      const seen: Array<{ cmd: string; error?: string }> = []
      fake.silence(['01 0C'])
      const transport = createReliableTransport(fake.io, {
        ...BASE_CONFIG,
        maxRetries: 0,
        onTrace: (entry) => seen.push({ cmd: entry.cmd, error: entry.error }),
      })

      const promise = transport.sendCommand('01 0C')
      const assertion = expect(promise).rejects.toThrow()
      await vi.advanceTimersByTimeAsync(1000)
      await assertion

      expect(seen).toHaveLength(1)
      expect(seen[0].cmd).toBe('01 0C')
      expect(seen[0].error).toMatch(/timeout/i)
    } finally {
      vi.useRealTimers()
    }
  })

  it('aplica el timeout largo al init y el corto a los comandos de datos', async () => {
    vi.useFakeTimers()
    try {
      fake.silence(['ATZ'])
      const transport = createReliableTransport(fake.io, {
        ...BASE_CONFIG,
        maxRetries: 0,
        initCommands: INIT,
        initTimeoutMs: 9000,
      })

      const promise = transport.sendCommand('01 0C')
      const assertion = expect(promise).rejects.toThrow(/timeout 9000 on ATZ/)
      await vi.advanceTimersByTimeAsync(9000)
      await assertion
    } finally {
      vi.useRealTimers()
    }
  })
})

/**
 * Secuencias exclusivas.
 *
 * El ELM327 es un dispositivo con estado global: `AT H1` y `AT SH xxx` cambian
 * como responde a *todos* los comandos siguientes. Una secuencia que los toca
 * —el barrido de ECUs— tiene que poder reservar la conexión de principio a fin:
 * la cola FIFO ordena comandos sueltos, no secuencias, y un `01 0C` colado en
 * medio vuelve con el header puesto o dirigido a la dirección equivocada.
 */
describe('createReliableTransport — secuencias exclusivas', () => {
  let fake: FakeIo

  beforeEach(() => {
    fake = createFakeIo()
  })

  it('no intercala comandos ajenos dentro de una secuencia exclusiva', async () => {
    const transport = createReliableTransport(fake.io, BASE_CONFIG)

    const barrido = transport.runExclusive(async (tx) => {
      await tx.sendCommand('AT H1')
      await tx.sendCommand('AT SH 7DF')
      await tx.sendCommand('01 00')
      await tx.sendCommand('AT H0')
      await tx.sendCommand('AT SH 7E0')
    })
    const telemetria = [
      transport.sendCommand('01 0C'),
      transport.sendCommand('01 05'),
      transport.sendCommand('01 0D'),
    ]

    await Promise.all([barrido, ...telemetria])

    const enviados = fake.sentOn(0)
    const inicio = enviados.indexOf('AT H1')
    const fin = enviados.indexOf('AT SH 7E0')
    expect(inicio).toBeGreaterThanOrEqual(0)
    expect(enviados.slice(inicio, fin + 1)).toEqual([
      'AT H1',
      'AT SH 7DF',
      '01 00',
      'AT H0',
      'AT SH 7E0',
    ])
  })

  it('devuelve el valor de la secuencia', async () => {
    const transport = createReliableTransport(fake.io, BASE_CONFIG)

    const resultado = await transport.runExclusive(async (tx) => {
      await tx.sendCommand('01 00')
      return 'listo'
    })

    expect(resultado).toBe('listo')
  })

  it('libera la conexión aunque la secuencia falle', async () => {
    const transport = createReliableTransport(fake.io, BASE_CONFIG)

    await expect(
      transport.runExclusive(async (tx) => {
        await tx.sendCommand('AT H1')
        throw new Error('el bus se cayó')
      }),
    ).rejects.toThrow('el bus se cayó')

    await transport.sendCommand('01 0C')
    expect(fake.sentOn(0)).toEqual(['AT H1', '01 0C'])
  })

  it('serializa dos secuencias exclusivas concurrentes', async () => {
    const transport = createReliableTransport(fake.io, BASE_CONFIG)

    await Promise.all([
      transport.runExclusive(async (tx) => {
        await tx.sendCommand('A1')
        await tx.sendCommand('A2')
      }),
      transport.runExclusive(async (tx) => {
        await tx.sendCommand('B1')
        await tx.sendCommand('B2')
      }),
    ])

    const enviados = fake.sentOn(0)
    expect(enviados.indexOf('A2')).toBe(enviados.indexOf('A1') + 1)
    expect(enviados.indexOf('B2')).toBe(enviados.indexOf('B1') + 1)
  })
})
