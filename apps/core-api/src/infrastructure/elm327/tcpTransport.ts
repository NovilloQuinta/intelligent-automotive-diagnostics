import { createConnection } from 'node:net'
import type { Socket } from 'node:net'
import { Elm327ConnectionError } from './errors.js'

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

// Marca los fallos de socket para que el drainer distinga reconexión (retry sin
// shift) de timeout de comando (retry con backoff hasta maxRetries, luego shift).
interface ConnectionError extends Elm327ConnectionError {
  connectionLost?: boolean
}

function isConnectionError(err: unknown): err is ConnectionError {
  return err instanceof Elm327ConnectionError && (err as ConnectionError).connectionLost === true
}

/**
 * Cliente TCP persistente para dispositivos ELM327.
 *
 * Evita la saturación del dispositivo al reutilizar una única conexión TCP en
 * vez de abrir un socket efímero por cada comando. Los comandos se encolan en
 * una FIFO con mutex para serializar las escrituras sobre el socket compartido.
 *
 * Si el socket se rompe, el cliente reconecta automáticamente con backoff
 * exponencial (100 ms base, cap 30 s por intento y 30 s totales) y reenvía el
 * comando que estaba en vuelo. `close()` detiene la reconexión y rechaza la
 * cola de forma graceful.
 */
export interface Elm327TcpClient {
  /** Abre el socket persistente. Idempotente; no-op tras `close()`. */
  connect(): Promise<void>
  /** Encola un comando ELM327 y resuelve con la respuesta cruda hasta el prompt `>`. */
  sendCommand(cmd: string): Promise<string>
  /** Shutdown graceful: destruye el socket, limpia timers y rechaza los comandos pendientes. */
  close(): Promise<void>
}

/**
 * Crea un cliente TCP persistente para un dispositivo ELM327 con cola FIFO,
 * mutex de escritura y auto-reconexión con backoff exponencial.
 *
 * @param config — host, port, timeout por comando y semántica de reintentos
 * @returns Cliente con `connect()`, `sendCommand()` y `close()`
 */
export function createElm327TcpClient(config: Elm327TcpConfig): Elm327TcpClient {
  const timeoutMs = config.timeout ?? DEFAULT_TIMEOUT_MS
  const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES
  const backoffMs = config.backoffMs ?? DEFAULT_BACKOFF_MS
  const { host, port } = config

  let socket: Socket | null = null
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

  // Marca el comando en vuelo como conexión perdida y dispara la
  // auto-reconexión. El flag `connectionLost` permite al drainer
  // distinguir este fallo de un timeout de comando común.
  function failActiveCommand(message: string): void {
    if (activeCommand === null) return
    const command = activeCommand
    activeCommand = null
    if (command.timeoutTimer !== null) clearTimeout(command.timeoutTimer)
    const error = new Elm327ConnectionError(message) as ConnectionError
    error.connectionLost = true
    command.reject(error)
  }

  // Acumula datos del socket hasta el prompt ">" y resuelve el
  // comando en vuelo. Ignora tráfico de sockets viejos (target !==
  // socket) tras una reconexión.
  function onData(target: Socket, chunk: Buffer): void {
    if (target !== socket) return
    if (activeCommand === null) return
    activeCommand.data += chunk.toString()
    if (activeCommand.data.includes('>')) {
      const command = activeCommand
      activeCommand = null
      if (command.timeoutTimer !== null) clearTimeout(command.timeoutTimer)
      command.resolve(command.data)
    }
  }

  function onSocketError(target: Socket, err: Error): void {
    if (target !== socket) return
    const code = (err as NodeJS.ErrnoException).code
    failActiveCommand(
      `ELM327 connection error (${code ?? err.message}) on ${host}:${port} — reconnecting`,
    )
    scheduleReconnect()
  }

  function onSocketClose(target: Socket): void {
    if (target !== socket) return
    failActiveCommand(`ELM327 connection closed on ${host}:${port} — reconnecting`)
    scheduleReconnect()
  }

  function bindSocketHandlers(target: Socket): void {
    target.setTimeout(timeoutMs)
    target.setKeepAlive(true)
    target.on('data', (chunk) => onData(target, chunk))
    target.on('error', (err) => onSocketError(target, err))
    target.on('close', () => onSocketClose(target))
  }

  async function connect(): Promise<void> {
    if (socket !== null || reconnectState === 'closed') return
    socket = createConnection({ host, port })
    bindSocketHandlers(socket)
  }

  // Backoff exponencial `min(100ms * 2^attempt, 30s)`. El cap total
  // de 30s se mide desde el primer fallo de la sesión (no por
  // intento): el estado no sale de 'reconnecting' hasta que un
  // comando se envía con éxito en `processQueue`.
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
        socket = createConnection({ host, port })
        bindSocketHandlers(socket)
        reconnectPromise = null
        resolve()
      }, delay)
    })
  }

  async function reconnect(): Promise<void> {
    if (reconnectState === 'closed') return
    if (reconnectPromise === null) scheduleReconnect()
    await reconnectPromise
  }

  // Escribe el comando al socket compartido con timeout.
  function sendCommandOnce(cmd: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      if (socket === null) {
        reject(new Elm327ConnectionError('ELM327 socket not connected'))
        return
      }
      const target = socket
      const command: ActiveCommand = { resolve, reject, data: '', timeoutTimer: null }
      activeCommand = command
      command.timeoutTimer = setTimeout(() => {
        if (activeCommand !== command) return
        activeCommand = null
        socket = null
        target.destroy()
        reject(
          new Elm327ConnectionError(
            `ELM327 timeout (${timeoutMs}ms) after command "${cmd}" on ${host}:${port}`,
          ),
        )
      }, timeoutMs)
      target.write(`${cmd}\r\n`)
    })
  }

  // Drena la cola FIFO con mutex. Tres ramas de reintento por entrada:
  //  - conexión perdida → espera reconexión, reenvía el mismo comando (sin shift)
  //  - timeout de comando  → reintenta con backoff por entrada hasta maxRetries
  //  - cliente cerrado      → rechaza y hace shift
  async function processQueue(): Promise<void> {
    if (isProcessing) return
    isProcessing = true
    while (commandQueue.length > 0) {
      const entry = commandQueue[0]
      try {
        if (socket === null) {
          if (reconnectState === 'closed') {
            throw new Elm327ConnectionError('ELM327 Connection closed')
          }
          if (reconnectState === 'reconnecting') {
            await reconnect()
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
          await reconnect()
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

  // `close()` despierta a quien esté esperando la reconexión pendiente
  // (`reconnectResolve`) para que el drainer no quede colgado con
  // `isProcessing` en true tras cancelar el timer.
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
    if (socket !== null) {
      socket.destroy()
      socket = null
    }
    failActiveCommand('ELM327 Connection closed')
    failQueue(new Elm327ConnectionError('ELM327 Connection closed'))
  }

  return { connect, sendCommand, close }
}
