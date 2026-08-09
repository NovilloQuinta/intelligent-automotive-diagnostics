import { SerialPort } from 'serialport'
import type { Elm327Transport } from '@/application/ports/Elm327Transport.js'
import { Elm327ConnectionError } from './errors.js'

const CONNECTION_CLOSED_MESSAGE = 'ELM327 Connection closed'

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
}

/** Timeout por defecto para comandos seriales (3 segundos). */
export const DEFAULT_SERIAL_TIMEOUT_MS = 3000

const DEFAULT_MAX_RETRIES = 3
const DEFAULT_BACKOFF_MS = 200
const RECONNECT_BASE_MS = 100
const RECONNECT_MAX_DELAY_MS = 30_000
const RECONNECT_MAX_TOTAL_MS = 30_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface CommandEntry {
  readonly cmd: string
  resolve: (value: string) => void
  reject: (reason: Error) => void
  attempts: number
}

interface ActiveCommand {
  resolve: (value: string) => void
  reject: (reason: Error) => void
  data: string
  timeoutTimer: ReturnType<typeof setTimeout> | null
}

interface ConnectionError extends Elm327ConnectionError {
  connectionLost?: boolean
}

function isConnectionError(err: unknown): err is ConnectionError {
  return err instanceof Elm327ConnectionError && (err as ConnectionError).connectionLost === true
}

/**
 * Crea un transporte serial persistente para un dispositivo ELM327 con cola
 * FIFO, mutex de escritura y auto-reconexión con backoff exponencial.
 *
 * Implementa {@link Elm327Transport} sobre un puerto serie.
 *
 * @param config — path, baudRate, timeout por comando y semántica de reintentos
 * @returns Transporte ELM327 con `connect()`, `sendCommand()` y `close()`
 */
export function createElm327SerialClient(config: SerialConfig): Elm327Transport {
  const timeoutMs = config.timeout ?? DEFAULT_SERIAL_TIMEOUT_MS
  const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES
  const backoffMs = config.backoffMs ?? DEFAULT_BACKOFF_MS
  const { path, baudRate } = config

  let port: SerialPort | null = null
  let reconnectState: 'connected' | 'reconnecting' | 'closed' = 'connected'
  let reconnectAttempt = 0
  let reconnectStartedAt = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectPromise: Promise<void> | null = null
  let reconnectResolve: (() => void) | null = null
  let activeCommand: ActiveCommand | null = null
  const commandQueue: CommandEntry[] = []
  let isProcessing = false

  // ── Internal helpers ──────────────────────────────────────────

  function failQueue(error: Elm327ConnectionError): void {
    let entry = commandQueue.shift()
    while (entry !== undefined) {
      entry.reject(error)
      entry = commandQueue.shift()
    }
  }

  function failActiveCommand(message: string): void {
    if (activeCommand === null) return
    const command = activeCommand
    activeCommand = null
    if (command.timeoutTimer !== null) clearTimeout(command.timeoutTimer)
    const error = new Elm327ConnectionError(message) as ConnectionError
    error.connectionLost = true
    command.reject(error)
  }

  function onData(target: SerialPort, chunk: Buffer): void {
    if (target !== port) return
    if (activeCommand === null) return
    activeCommand.data += chunk.toString()
    if (activeCommand.data.includes('>')) {
      const command = activeCommand
      activeCommand = null
      if (command.timeoutTimer !== null) clearTimeout(command.timeoutTimer)
      command.resolve(command.data)
    }
  }

  function onPortError(target: SerialPort, err: Error): void {
    if (target !== port) return
    failActiveCommand(`ELM327 serial error (${err.message}) on ${path} — reconnecting`)
    scheduleReconnect()
  }

  function onPortClose(target: SerialPort): void {
    if (target !== port) return
    failActiveCommand(`ELM327 serial connection closed on ${path} — reconnecting`)
    scheduleReconnect()
  }

  function bindPortHandlers(target: SerialPort): void {
    target.on('data', (chunk: Buffer) => onData(target, chunk))
    target.on('error', (err: Error) => onPortError(target, err))
    target.on('close', () => onPortClose(target))
  }

  async function connect(): Promise<void> {
    if (port !== null || reconnectState === 'closed') return
    port = new SerialPort({ path, baudRate })
    bindPortHandlers(port)
  }

  function createPort(): SerialPort {
    const newPort = new SerialPort({ path, baudRate })
    bindPortHandlers(newPort)
    return newPort
  }

  function scheduleReconnect(): void {
    if (reconnectState === 'closed' || reconnectPromise !== null) return
    if (reconnectState !== 'reconnecting') {
      reconnectState = 'reconnecting'
      reconnectStartedAt = Date.now()
    }
    if (Date.now() - reconnectStartedAt >= RECONNECT_MAX_TOTAL_MS) {
      failQueue(new Elm327ConnectionError('Reconnection failed after 30s'))
      return
    }
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttempt, RECONNECT_MAX_DELAY_MS)
    reconnectAttempt++
    reconnectPromise = new Promise<void>((resolve) => {
      reconnectResolve = resolve
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        reconnectResolve = null
        if (reconnectState === 'closed') {
          reconnectPromise = null
          resolve()
          return
        }
        port = createPort()
        reconnectPromise = null
        resolve()
      }, delay)
    })
  }

  async function doReconnect(): Promise<void> {
    if (reconnectState === 'closed') return
    if (reconnectPromise === null) scheduleReconnect()
    await reconnectPromise
  }

  function sendCommandOnce(cmd: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      if (port === null) {
        reject(new Elm327ConnectionError('ELM327 serial port not connected'))
        return
      }
      const target = port
      const command: ActiveCommand = { resolve, reject, data: '', timeoutTimer: null }
      activeCommand = command
      command.timeoutTimer = setTimeout(() => {
        if (activeCommand !== command) return
        activeCommand = null
        port = null
        target.close()
        reject(
          new Elm327ConnectionError(
            `ELM327 timeout (${timeoutMs}ms) after command "${cmd}" on ${path}`,
          ),
        )
      }, timeoutMs)
      target.write(`${cmd}\r\n`)
      void target.drain()
    })
  }

  async function processQueue(): Promise<void> {
    if (isProcessing) return
    isProcessing = true
    while (commandQueue.length > 0) {
      const entry = commandQueue[0]
      try {
        if (port === null) {
          if (reconnectState === 'closed') {
            throw new Elm327ConnectionError(CONNECTION_CLOSED_MESSAGE)
          }
          if (reconnectState === 'reconnecting') {
            await doReconnect()
          } else {
            await connect()
          }
        }
        const result = await sendCommandOnce(entry.cmd)
        reconnectAttempt = 0
        reconnectStartedAt = 0
        reconnectState = 'connected'
        entry.resolve(result)
        commandQueue.shift()
      } catch (err) {
        if (reconnectState === 'closed') {
          entry.reject(err as Error)
          commandQueue.shift()
        } else if (isConnectionError(err)) {
          await doReconnect()
        } else if (entry.attempts < maxRetries) {
          entry.attempts++
          await sleep(backoffMs * 2 ** entry.attempts)
        } else {
          entry.reject(err as Error)
          commandQueue.shift()
        }
      }
    }
    isProcessing = false
  }

  async function sendCommand(cmd: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      commandQueue.push({ cmd, resolve, reject, attempts: 0 })
      void processQueue()
    })
  }

  async function close(): Promise<void> {
    if (reconnectState === 'closed') return
    reconnectState = 'closed'
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (reconnectResolve !== null) {
      reconnectResolve()
      reconnectResolve = null
    }
    reconnectPromise = null
    if (port !== null) {
      port.close()
      port = null
    }
    failActiveCommand(CONNECTION_CLOSED_MESSAGE)
    failQueue(new Elm327ConnectionError(CONNECTION_CLOSED_MESSAGE))
  }

  return { connect, sendCommand, close }
}
