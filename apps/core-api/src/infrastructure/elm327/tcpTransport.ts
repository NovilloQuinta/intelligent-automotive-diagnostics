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

/** Reintentos por defecto ante fallos de envío. */
const DEFAULT_MAX_RETRIES = 3

/** Backoff base por defecto entre reintentos de envío (200ms). */
const DEFAULT_BACKOFF_MS = 200

/** Backoff base de la auto-reconexión (100ms). */
const RECONNECT_BASE_MS = 100

/** Cap por intento de reconexión: min(100ms * 2^attempt, 30s). */
const RECONNECT_MAX_DELAY_MS = 30_000

/** Cap total de la auto-reconexión: si tras 30s no se reconecta, se rechazan los comandos pendientes. */
const RECONNECT_MAX_TOTAL_MS = 30_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Entrada de la cola FIFO de comandos pendientes. */
interface CommandEntry {
  readonly cmd: string
  resolve: (value: string) => void
  reject: (reason: Error) => void
  attempts: number
}

/** Comando actualmente en vuelo hacia el socket: acumula la respuesta hasta el prompt ">". */
interface ActiveCommand {
  resolve: (value: string) => void
  reject: (reason: Error) => void
  data: string
  timeoutTimer: ReturnType<typeof setTimeout> | null
}

/** Error de conexión marcado para distinguir fallos del socket de fallos del comando (timeout). */
interface ConnectionError extends Elm327ConnectionError {
  connectionLost?: boolean
}

function isConnectionError(err: unknown): err is ConnectionError {
  return err instanceof Elm327ConnectionError && (err as ConnectionError).connectionLost === true
}

/** API pública del cliente TCP persistente. */
export interface Elm327TcpClient {
  /** Abre el socket persistente y configura sus handlers. Idempotente; no-op tras `close()`. */
  connect(): Promise<void>
  /** Encola un comando ELM327 y resuelve con la respuesta cruda (hasta el prompt ">"). */
  sendCommand(cmd: string): Promise<string>
  /** Shutdown graceful: destruye el socket, limpia timers y rechaza los comandos pendientes. No reactiva la reconexión. */
  close(): Promise<void>
}

/**
 * Cliente TCP persistente para dispositivos ELM327 con cola FIFO y auto-reconexión.
 * Mantiene un único socket vivo (creado por `connect()`) reutilizado por todos los
 * comandos; `sendCommand` encola y serializa las escrituras. Si el socket emite
 * `error`/`close`, el cliente reconecta automáticamente con backoff exponencial
 * (100ms base, cap 30s por intento y 30s totales) y reenvía el comando en vuelo.
 * `maxRetries` solo aplica a fallos de envío (timeout del prompt ">"), no a fallos
 * de conexión. `close()` detiene la reconexión y rechaza la cola con
 * "Connection closed".
 * @param config — host/port del dispositivo y semántica de timeout/reintentos
 * @returns Cliente con `connect()`, `sendCommand()` y `close()`
 * @throws Elm327ConnectionError — timeout de comando, caída del socket o cierre del cliente
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
  /** Resolver de `reconnectPromise`: permite a `close()` despertar a quien espera la reconexión. */
  let reconnectResolve: (() => void) | null = null
  let activeCommand: ActiveCommand | null = null
  const commandQueue: CommandEntry[] = []
  let isProcessing = false

  /** Rechaza todos los comandos pendientes con `error` y vacía la cola. */
  function failQueue(error: Elm327ConnectionError): void {
    let entry = commandQueue.shift()
    while (entry !== undefined) {
      entry.reject(error)
      entry = commandQueue.shift()
    }
  }

  /** Rechaza el comando en vuelo como fallo de conexión y dispara la reconexión. */
  function failActiveCommand(message: string): void {
    if (activeCommand === null) return
    const command = activeCommand
    activeCommand = null
    if (command.timeoutTimer !== null) clearTimeout(command.timeoutTimer)
    const error = new Elm327ConnectionError(message) as ConnectionError
    error.connectionLost = true
    command.reject(error)
  }

  /** Acumula la respuesta y resuelve el comando en vuelo al recibir el prompt ">". */
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

  /** Crea el socket persistente y configura sus handlers. Idempotente y no-op tras `close()`. */
  async function connect(): Promise<void> {
    if (socket !== null || reconnectState === 'closed') return
    socket = createConnection({ host, port })
    bindSocketHandlers(socket)
  }

  /**
   * Programa el siguiente intento de reconexión con backoff exponencial
   * `min(100ms * 2^attempt, 30s)`. Idempotente: si ya hay un intento en curso,
   * no programa otro. Si se supera el cap total de 30s, rechaza la cola.
   * El estado permanece en 'reconnecting' hasta que un comando se envía con
   * éxito (ver `processQueue`), de modo que el cap total se mide desde el
   * primer fallo de la sesión, no por intento.
   */
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

  /** Espera a que termine el intento de reconexión en curso. No-op si el cliente está cerrado. */
  async function reconnect(): Promise<void> {
    if (reconnectState === 'closed') return
    if (reconnectPromise === null) scheduleReconnect()
    await reconnectPromise
  }

  /** Escribe el comando al socket compartido y espera la respuesta hasta el prompt ">". */
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

  /** Drena la cola FIFO con mutex: reintenta por conexión (auto-reconexión) o por envío (`maxRetries`). */
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
        // Éxito: la sesión de reconexión termina (estado y backoff se resetean)
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
          // Fallo de conexión: espera a la auto-reconexión y reintenta el mismo comando (sin shift)
          await reconnect()
        } else if (entry.attempts < maxRetries) {
          // Fallo de envío (timeout del prompt ">"): reintento con backoff
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

  /** Encola el comando y arranca el drenado de la cola. */
  async function sendCommand(cmd: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      commandQueue.push({ cmd, resolve, reject, attempts: 0 })
      void processQueue()
    })
  }

  /** Cierre graceful: detiene la reconexión, destruye el socket y rechaza la cola con "Connection closed". */
  async function close(): Promise<void> {
    if (reconnectState === 'closed') return
    reconnectState = 'closed'
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    // Despierta a quien esté esperando la reconexión pendiente: sin esto, un
    // `close()` durante la reconexión dejaría al drainer colgado para siempre
    // (timer cancelado, promesa nunca resuelta) con `isProcessing` en true.
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
