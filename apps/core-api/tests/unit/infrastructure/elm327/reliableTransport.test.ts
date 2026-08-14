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
