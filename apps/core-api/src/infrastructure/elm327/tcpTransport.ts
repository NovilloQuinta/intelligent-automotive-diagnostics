import { createConnection } from 'node:net'
import type { Socket } from 'node:net'
import type { Elm327Transport } from '@/application/ports/Elm327Transport.js'
import type { TransportIoAdapter } from './reliableTransport.js'
import { createReliableTransport } from './reliableTransport.js'

/** Configuración del transporte TCP al dispositivo ELM327. */
export interface Elm327TcpConfig {
  readonly host: string
  readonly port: number
  /** Timeout por comando en ms (default 3000). */
  readonly timeout?: number
  /** Reintentos ante fallos de envío del comando (timeout del prompt ">", default 3). Los fallos de conexión los gestiona la auto-reconexión. */
  readonly maxRetries?: number
  /** Backoff base entre reintentos de envío en ms (default 200). */
  readonly backoffMs?: number
}

/** Timeout por defecto para comandos TCP (3 segundos). */
export const DEFAULT_TIMEOUT_MS = 3000

const DEFAULT_MAX_RETRIES = 3
const DEFAULT_BACKOFF_MS = 200

/**
 * Crea un transporte TCP persistente para un dispositivo ELM327 con cola FIFO,
 * mutex de escritura y auto-reconexión con backoff exponencial.
 *
 * Implementa {@link Elm327Transport} sobre un socket TCP compartido, delegando
 * la máquina de estados de cola/reconexión a {@link createReliableTransport}.
 *
 * @param config — host, port, timeout por comando y semántica de reintentos
 * @returns Transporte ELM327 con `connect()`, `sendCommand()` y `close()`
 */
export function createElm327TcpClient(config: Elm327TcpConfig): Elm327Transport {
  const timeoutMs = config.timeout ?? DEFAULT_TIMEOUT_MS
  const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES
  const backoffMs = config.backoffMs ?? DEFAULT_BACKOFF_MS
  const { host, port } = config
  const target = `${host}:${port}`

  const io: TransportIoAdapter<Socket> = {
    open: () => createConnection({ host, port }),
    bind(socket, handlers) {
      socket.setTimeout(timeoutMs)
      socket.setKeepAlive(true)
      socket.on('data', (chunk: Buffer) => handlers.onData(chunk))
      socket.on('error', (err: Error) => handlers.onError(err))
      socket.on('close', () => handlers.onClose())
    },
    write: (socket, payload) => {
      socket.write(payload)
    },
    destroy: (socket) => socket.destroy(),
    shutdown: (socket) => socket.destroy(),
    describeError: (err) => (err as NodeJS.ErrnoException).code ?? err.message,
    connectionErrorMessage: (detail) => `ELM327 connection error (${detail}) on ${target} — reconnecting`,
    connectionClosedMessage: () => `ELM327 connection closed on ${target} — reconnecting`,
    notConnectedMessage: () => 'ELM327 socket not connected',
    commandTimeoutMessage: (cmd, ms) => `ELM327 timeout (${ms}ms) after command "${cmd}" on ${target}`,
  }

  return createReliableTransport(io, { timeoutMs, maxRetries, backoffMs })
}
