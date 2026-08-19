import type {
  Elm327ExclusiveSession,
  Elm327Transport,
} from '@/application/ports/Elm327Transport.js'
import { Elm327ConnectionError } from './errors.js'

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

// Marca los fallos de conexión para que el drainer distinga reconexión (retry
// sin shift) de timeout de comando (retry con backoff hasta maxRetries, luego shift).
interface ConnectionError extends Elm327ConnectionError {
  connectionLost?: boolean
}

function isConnectionError(err: unknown): err is ConnectionError {
  return err instanceof Elm327ConnectionError && (err as ConnectionError).connectionLost === true
}

/**
 * Adaptador de I/O de bajo nivel que un transporte concreto (TCP, serie...)
 * debe implementar para reutilizar el núcleo de {@link createReliableTransport}.
 * Solo conoce el primitivo de conexión: crear, enlazar eventos, escribir y cerrar.
 */
export interface TransportIoAdapter<TConn> {
  /** Crea la conexión subyacente, sin enlazar todavía sus eventos. */
  open(): TConn
  /** Enlaza los listeners de datos/error/cierre a una conexión ya creada. */
  bind(
    conn: TConn,
    handlers: { onData(chunk: Buffer): void; onError(err: Error): void; onClose(): void },
  ): void
  /** Envía el comando (ya con su terminador) por la conexión. */
  write(conn: TConn, payload: string): void
  /** Cierra la conexión de forma abrupta, por timeout de comando. */
  destroy(conn: TConn): void
  /** Cierra la conexión de forma normal, en `close()`. */
  shutdown(conn: TConn): void
  /** Extrae el detalle legible de un error nativo (código de socket, mensaje...). */
  describeError(err: Error): string
  /** Mensaje de error de conexión, con el detalle propio del transporte. */
  connectionErrorMessage(detail: string): string
  /** Mensaje de cierre de conexión inesperado. */
  connectionClosedMessage(): string
  /** Mensaje cuando se intenta enviar sin conexión abierta. */
  notConnectedMessage(): string
  /** Mensaje de timeout de comando. */
  commandTimeoutMessage(cmd: string, timeoutMs: number): string
}

/**
 * Un intercambio con el adaptador, tal cual ocurrio en el cable.
 *
 * Es material de seguimiento en vivo, no un registro: nadie lo persiste, y el
 * observador que lo recibe debe ser barato porque esto se dispara en cada
 * comando, varias veces por segundo.
 */
export interface Elm327TraceEntry {
  /** Comando enviado, sin el terminador. */
  readonly cmd: string
  /** Respuesta cruda del adaptador. Ausente si el comando fallo. */
  readonly raw?: string
  /** Motivo del fallo. Ausente si el comando respondio. */
  readonly error?: string
  /** Tiempo entre el envio y la respuesta (o el fallo), en ms. */
  readonly durationMs: number
}

/** Configuración del núcleo de reconexión/reintentos, ya resuelta con sus valores por defecto. */
export interface ReliableTransportConfig {
  readonly timeoutMs: number
  readonly maxRetries: number
  readonly backoffMs: number
  /**
   * Comandos enviados nada más abrir la conexión, antes de cualquier lectura, y
   * de nuevo tras cada reconexión, porque el adaptador pierde su estado.
   *
   * Vacío para el emulador, que no necesita negociar nada. Un ELM327 físico sí:
   * arranca con el echo activado y sin protocolo seleccionado.
   */
  readonly initCommands?: readonly string[]
  /**
   * Timeout de cada comando de init. Más largo que el de datos porque `ATZ`
   * reinicia el chip y la selección de protocolo dispara `SEARCHING...`, que en
   * un vehículo real tarda varios segundos.
   */
  readonly initTimeoutMs?: number
  /**
   * Observador de cada intercambio, para seguir la conexion en vivo. Recibe
   * tambien los comandos de init y cada reintento fisico, que es justo lo que
   * hace falta ver cuando el enlace con el vehiculo va mal.
   */
  readonly onTrace?: (entry: Elm327TraceEntry) => void
}

/**
 * Núcleo compartido de transporte ELM327 fiable: cola FIFO, mutex de escritura
 * y auto-reconexión con backoff exponencial. Parametrizado por un
 * {@link TransportIoAdapter} que aporta el I/O concreto (TCP, serie...), de
 * forma que la máquina de estados de reconexión/reintentos vive en un solo
 * sitio en vez de duplicarse por transporte.
 *
 * @param io - adaptador de I/O del transporte concreto
 * @param config - timeout por comando, reintentos y backoff ya resueltos
 * @returns Transporte ELM327 con `connect()`, `sendCommand()` y `close()`
 */
export function createReliableTransport<TConn>(
  io: TransportIoAdapter<TConn>,
  {
    timeoutMs,
    maxRetries,
    backoffMs,
    initCommands = [],
    initTimeoutMs,
    onTrace,
  }: ReliableTransportConfig,
): Elm327Transport {
  const initMs = initTimeoutMs ?? timeoutMs
  // Se rearma en cada apertura de conexión: el adaptador olvida su configuración.
  let initPending = initCommands.length > 0
  let conn: TConn | null = null
  let reconnectState: 'connected' | 'reconnecting' | 'closed' = 'connected'
  let reconnectAttempt = 0
  let reconnectStartedAt = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectPromise: Promise<void> | null = null
  let reconnectResolve: (() => void) | null = null
  let activeCommand: ActiveCommand | null = null
  const commandQueue: CommandEntry[] = []
  let isProcessing = false

  /** Reserva viva, o `null` si la conexion esta libre. `sendCommand` espera a que resuelva. */
  let exclusiveRelease: Promise<void> | null = null

  /** Cola de reservas: encadena `runExclusive` entre si para que no se solapen. */
  let exclusiveTail: Promise<void> = Promise.resolve()

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

  // Ignora tráfico/eventos de conexiones viejas (target !== conn) tras una reconexión.
  function onData(target: TConn, chunk: Buffer): void {
    if (target !== conn) return
    if (activeCommand === null) return
    activeCommand.data += chunk.toString()
    if (activeCommand.data.includes('>')) {
      const command = activeCommand
      activeCommand = null
      if (command.timeoutTimer !== null) clearTimeout(command.timeoutTimer)
      command.resolve(command.data)
    }
  }

  function onIoError(target: TConn, err: Error): void {
    if (target !== conn) return
    failActiveCommand(io.connectionErrorMessage(io.describeError(err)))
    scheduleReconnect()
  }

  function onIoClose(target: TConn): void {
    if (target !== conn) return
    failActiveCommand(io.connectionClosedMessage())
    scheduleReconnect()
  }

  function openConnection(): TConn {
    initPending = initCommands.length > 0
    const target = io.open()
    io.bind(target, {
      onData: (chunk) => onData(target, chunk),
      onError: (err) => onIoError(target, err),
      onClose: () => onIoClose(target),
    })
    return target
  }

  async function connect(): Promise<void> {
    if (conn !== null || reconnectState === 'closed') return
    conn = openConnection()
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
        conn = openConnection()
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

  /**
   * Envuelve el envio para cronometrarlo y notificar la traza.
   *
   * Llama a {@link sendCommandOnceRaw} de forma sincrona a proposito: encadenar
   * un `await` antes de escribir cederia un microtask y retrasaria la escritura
   * del comando un tick.
   */
  function sendCommandOnce(cmd: string, commandTimeoutMs: number): Promise<string> {
    if (onTrace === undefined) return sendCommandOnceRaw(cmd, commandTimeoutMs)
    const startedAt = Date.now()
    return sendCommandOnceRaw(cmd, commandTimeoutMs).then(
      (raw) => {
        onTrace({ cmd, raw, durationMs: Date.now() - startedAt })
        return raw
      },
      (err: unknown) => {
        const error = err instanceof Error ? err.message : String(err)
        onTrace({ cmd, error, durationMs: Date.now() - startedAt })
        throw err
      },
    )
  }

  function sendCommandOnceRaw(cmd: string, commandTimeoutMs: number): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      if (conn === null) {
        reject(new Elm327ConnectionError(io.notConnectedMessage()))
        return
      }
      const target = conn
      const command: ActiveCommand = { resolve, reject, data: '', timeoutTimer: null }
      activeCommand = command
      command.timeoutTimer = setTimeout(() => {
        if (activeCommand !== command) return
        activeCommand = null
        conn = null
        io.destroy(target)
        reject(new Elm327ConnectionError(io.commandTimeoutMessage(cmd, commandTimeoutMs)))
      }, commandTimeoutMs)
      io.write(target, `${cmd}\r\n`)
    })
  }

  /**
   * Negocia la sesión con el adaptador antes de la primera lectura. Se ejecuta
   * dentro del drenado de la cola, de modo que un solo punto cubre tanto la
   * conexión inicial como cada reconexión posterior.
   *
   * No filtra las respuestas: un clon que no reconozca un comando contesta `?`
   * y se sigue adelante. Solo un timeout aborta, y lo hace propagando el error
   * para que el reintento normal de la cola vuelva a intentarlo.
   */
  async function runInit(): Promise<void> {
    for (const cmd of initCommands) {
      await sendCommandOnce(cmd, initMs)
    }
    initPending = false
  }

  async function processQueue(): Promise<void> {
    if (isProcessing) return
    isProcessing = true
    while (commandQueue.length > 0) {
      const entry = commandQueue[0]
      try {
        if (conn === null) {
          if (reconnectState === 'closed') {
            throw new Elm327ConnectionError('ELM327 Connection closed')
          }
          if (reconnectState === 'reconnecting') {
            await doReconnect()
          } else {
            await connect()
          }
        }
        // Guarda en el sitio de llamada, no dentro de runInit: sin init, el
        // comando debe escribirse en el mismo tick, sin ceder un microtask.
        if (initPending) await runInit()
        const result = await sendCommandOnce(entry.cmd, timeoutMs)
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

  /** Encola el comando sin mirar la reserva: es la via que usa la propia secuencia. */
  function enqueue(cmd: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      commandQueue.push({ cmd, resolve, reject, attempts: 0 })
      void processQueue()
    })
  }

  async function sendCommand(cmd: string): Promise<string> {
    // `while` y no `if`: al despertar puede haber empezado ya la siguiente reserva.
    while (exclusiveRelease !== null) await exclusiveRelease
    return enqueue(cmd)
  }

  /**
   * Reserva la conexion para una secuencia entera. Ver {@link Elm327Transport.runExclusive}.
   *
   * `exclusiveTail` encadena las reservas entre si (dos barridos concurrentes no se
   * mezclan) y `exclusiveRelease` es lo que hace esperar a `sendCommand`.
   */
  async function runExclusive<T>(fn: (session: Elm327ExclusiveSession) => Promise<T>): Promise<T> {
    const previous = exclusiveTail
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    exclusiveTail = previous.then(() => held)
    await previous
    exclusiveRelease = held
    try {
      return await fn({ sendCommand: enqueue })
    } finally {
      exclusiveRelease = null
      release()
    }
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
    if (conn !== null) {
      io.shutdown(conn)
      conn = null
    }
    failActiveCommand('ELM327 Connection closed')
    failQueue(new Elm327ConnectionError('ELM327 Connection closed'))
  }

  return { connect, sendCommand, runExclusive, close }
}
