/**
 * Transporte ELM327 fiable sobre el plugin USB nativo de Android.
 *
 * Adaptacion de `apps/core-api/src/infrastructure/elm327/reliableTransport.ts`
 * para un unico dispositivo fisico (el USB-OTG del propio telefono) hablado a
 * traves de un plugin Capacitor asincrono en vez de un socket/puerto serie
 * sincrono de Node. Conserva las mismas garantias de comportamiento:
 *
 * - Cola FIFO de comandos, uno en vuelo a la vez.
 * - Acumula la respuesta hasta ver el prompt `>` del ELM327 (mismo framing
 *   que `reliableTransport.ts`).
 * - Timeout por comando.
 * - `runExclusive` reserva la conexion para una secuencia entera (barrido de
 *   ECUs, lectura de DTC con headers), igual semantica que el backend.
 * - Negociacion de sesion (`ELM327_INIT_COMMANDS`) tras conectar.
 *
 * No reintenta con backoff exponencial ni reconecta en segundo plano: aqui hay
 * un unico consumidor (la propia app) y un unico dispositivo (el cable que el
 * mecanico tiene delante), asi que un fallo de conexion se propaga al llamador
 * en vez de reintentarse en silencio — la UI ya informa y deja reintentar.
 */
import { ObdUsb } from './capacitorObdPlugin'
import { Elm327ConnectionError } from './errors'
import { ELM327_INIT_COMMANDS, ELM327_INIT_TIMEOUT_MS } from './initSequence'
import type { Elm327ExclusiveSession, Elm327TransportPort } from './transportPort'

const ELM327_PROMPT = '>'
const ELM327_BAUD_RATE = 38400
const DEFAULT_COMMAND_TIMEOUT_MS = 4000

interface CommandEntry {
  readonly cmd: string
  readonly timeoutMs: number
  resolve: (value: string) => void
  reject: (reason: Error) => void
}

interface ActiveCommand {
  resolve: (value: string) => void
  reject: (reason: Error) => void
  data: string
  timeoutTimer: ReturnType<typeof setTimeout> | null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Crea el transporte ELM327 sobre USB nativo. `connect()` pide permiso USB (si
 * hace falta) y abre el puerto a 38400 baudios — el que trae de fabrica
 * cualquier ELM327 —, despues negocia la sesion con {@link ELM327_INIT_COMMANDS}.
 */
export function createNativeUsbTransport(): Elm327TransportPort {
  let connected = false
  let connectPromise: Promise<void> | null = null
  let activeCommand: ActiveCommand | null = null
  const commandQueue: CommandEntry[] = []
  let isProcessing = false
  let listenersReady = false

  let exclusiveRelease: Promise<void> | null = null
  let exclusiveTail: Promise<void> = Promise.resolve()

  function failActiveCommand(message: string): void {
    if (activeCommand === null) return
    const command = activeCommand
    activeCommand = null
    if (command.timeoutTimer !== null) clearTimeout(command.timeoutTimer)
    command.reject(new Elm327ConnectionError(message))
  }

  function failQueue(error: Elm327ConnectionError): void {
    let entry = commandQueue.shift()
    while (entry !== undefined) {
      entry.reject(error)
      entry = commandQueue.shift()
    }
  }

  async function ensureListeners(): Promise<void> {
    if (listenersReady) return
    listenersReady = true
    await ObdUsb.addListener('dataReceived', (event) => {
      if (activeCommand === null) return
      activeCommand.data += event.data
      if (activeCommand.data.includes(ELM327_PROMPT)) {
        const command = activeCommand
        activeCommand = null
        if (command.timeoutTimer !== null) clearTimeout(command.timeoutTimer)
        command.resolve(command.data)
      }
    })
    await ObdUsb.addListener('deviceDisconnected', (event) => {
      connected = false
      failActiveCommand(`ELM327 USB desconectado: ${event.message}`)
      failQueue(new Elm327ConnectionError(`ELM327 USB desconectado: ${event.message}`))
    })
  }

  async function openConnection(): Promise<void> {
    await ensureListeners()
    const permission = await ObdUsb.requestPermission()
    if (!permission.granted) {
      throw new Elm327ConnectionError(
        'Permiso USB denegado. Vuelve a conectar el adaptador y acepta el permiso.',
      )
    }
    const result = await ObdUsb.connect({ baudRate: ELM327_BAUD_RATE })
    if (!result.connected) {
      throw new Elm327ConnectionError('No se pudo abrir el puerto serie del adaptador USB.')
    }
    connected = true
  }

  async function connect(): Promise<void> {
    if (connected) return
    if (connectPromise === null) {
      connectPromise = openConnection().finally(() => {
        connectPromise = null
      })
    }
    await connectPromise
  }

  function sendCommandOnceRaw(cmd: string, timeoutMs: number): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      if (!connected) {
        reject(new Elm327ConnectionError('ELM327 USB no conectado'))
        return
      }
      const command: ActiveCommand = { resolve, reject, data: '', timeoutTimer: null }
      activeCommand = command
      command.timeoutTimer = setTimeout(() => {
        if (activeCommand !== command) return
        activeCommand = null
        reject(
          new Elm327ConnectionError(`ELM327 timeout (${timeoutMs}ms) tras el comando "${cmd}"`),
        )
      }, timeoutMs)
      void ObdUsb.write({ data: `${cmd}\r\n` }).catch((err: unknown) => {
        if (activeCommand !== command) return
        activeCommand = null
        if (command.timeoutTimer !== null) clearTimeout(command.timeoutTimer)
        reject(new Elm327ConnectionError(`Fallo al escribir en el USB: ${String(err)}`))
      })
    })
  }

  let initPending = true

  async function runInit(): Promise<void> {
    for (const cmd of ELM327_INIT_COMMANDS) {
      await sendCommandOnceRaw(cmd, ELM327_INIT_TIMEOUT_MS)
    }
    initPending = false
  }

  async function processQueue(): Promise<void> {
    if (isProcessing) return
    isProcessing = true
    while (commandQueue.length > 0) {
      const entry = commandQueue[0]
      try {
        if (!connected) await connect()
        if (initPending) await runInit()
        const result = await sendCommandOnceRaw(entry.cmd, entry.timeoutMs)
        entry.resolve(result)
        commandQueue.shift()
      } catch (err) {
        entry.reject(err as Error)
        commandQueue.shift()
        // Un fallo de conexion no vacia el resto de la cola por reintento
        // automatico (ver JSDoc del modulo): cada entrada se resuelve o
        // rechaza una vez y sigue la siguiente, tras una breve espera para no
        // martillear el USB si el dispositivo acaba de desconectarse.
        if (!connected) await sleep(50)
      }
    }
    isProcessing = false
  }

  function enqueue(cmd: string, timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      commandQueue.push({ cmd, timeoutMs, resolve, reject })
      void processQueue()
    })
  }

  async function sendCommand(cmd: string): Promise<string> {
    while (exclusiveRelease !== null) await exclusiveRelease
    return enqueue(cmd)
  }

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
    failActiveCommand('ELM327 USB connection closed')
    failQueue(new Elm327ConnectionError('ELM327 USB connection closed'))
    connected = false
    initPending = true
    await ObdUsb.disconnect()
  }

  return { connect, sendCommand, runExclusive, close }
}
