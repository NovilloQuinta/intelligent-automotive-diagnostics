import { SerialPort } from 'serialport'
import type { Elm327Transport } from '@/application/ports/Elm327Transport.js'
import type { TransportIoAdapter, ReliableTransportConfig } from './reliableTransport.js'
import { createReliableTransport } from './reliableTransport.js'

/** Configuración del transporte serial al dispositivo ELM327. */
export interface SerialConfig {
  /** Path del dispositivo (ej. '/dev/ttyUSB0', '/dev/ttyAMA0'). */
  readonly path: string
  /** Baud rate (default 38400 — estándar de fábrica ELM327). */
  readonly baudRate: number
  /** Timeout por comando en ms (default 3000). */
  readonly timeout?: number
  /** Reintentos ante fallos de envío del comando (timeout del prompt ">", default 3). */
  readonly maxRetries?: number
  /** Backoff base entre reintentos de envío en ms (default 200). */
  readonly backoffMs?: number
  /** Comandos de negociación con el adaptador. Vacío para el emulador. */
  readonly initCommands?: readonly string[]
  /** Timeout de cada comando de init (default: el de comando). */
  readonly initTimeoutMs?: number
  /** Observador de cada intercambio, para seguir la conexion en vivo. */
  readonly onTrace?: ReliableTransportConfig['onTrace']
}

/** Timeout por defecto para comandos seriales (3 segundos). */
export const DEFAULT_SERIAL_TIMEOUT_MS = 3000

const DEFAULT_MAX_RETRIES = 3
const DEFAULT_BACKOFF_MS = 200

/**
 * Crea un transporte serial persistente para un dispositivo ELM327 con cola
 * FIFO, mutex de escritura y auto-reconexión con backoff exponencial.
 *
 * Implementa {@link Elm327Transport} sobre un puerto serie, delegando la
 * máquina de estados de cola/reconexión a {@link createReliableTransport}.
 *
 * @param config — path, baudRate, timeout por comando y semántica de reintentos
 * @returns Transporte ELM327 con `connect()`, `sendCommand()` y `close()`
 */
export function createElm327SerialClient(config: SerialConfig): Elm327Transport {
  const timeoutMs = config.timeout ?? DEFAULT_SERIAL_TIMEOUT_MS
  const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES
  const backoffMs = config.backoffMs ?? DEFAULT_BACKOFF_MS
  const { path, baudRate } = config

  const io: TransportIoAdapter<SerialPort> = {
    open: () => new SerialPort({ path, baudRate }),
    bind(port, handlers) {
      port.on('data', (chunk: Buffer) => handlers.onData(chunk))
      port.on('error', (err: Error) => handlers.onError(err))
      port.on('close', () => handlers.onClose())
    },
    write: (port, payload) => {
      port.write(payload)
      void port.drain()
    },
    destroy: (port) => port.close(),
    shutdown: (port) => port.close(),
    describeError: (err) => err.message,
    connectionErrorMessage: (detail) => `ELM327 serial error (${detail}) on ${path} — reconnecting`,
    connectionClosedMessage: () => `ELM327 serial connection closed on ${path} — reconnecting`,
    notConnectedMessage: () => 'ELM327 serial port not connected',
    commandTimeoutMessage: (cmd, ms) =>
      `ELM327 timeout (${ms}ms) after command "${cmd}" on ${path}`,
  }

  return createReliableTransport(io, {
    timeoutMs,
    maxRetries,
    backoffMs,
    initCommands: config.initCommands,
    initTimeoutMs: config.initTimeoutMs,
    onTrace: config.onTrace,
  })
}
