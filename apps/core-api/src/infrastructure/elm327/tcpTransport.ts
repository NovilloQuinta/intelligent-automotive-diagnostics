import { createConnection } from 'node:net'
import { Elm327ConnectionError } from './errors.js'

/** Configuración del transporte TCP al dispositivo ELM327. */
export interface Elm327TcpConfig {
  readonly host: string
  readonly port: number
  /** Timeout por comando en ms (default 3000). */
  readonly timeout?: number
  /** Reintentos ante fallos de conexión (default 3). */
  readonly maxRetries?: number
  /** Backoff base entre reintentos en ms (default 200). */
  readonly backoffMs?: number
}

/** Timeout por defecto para comandos TCP (3 segundos). */
export const DEFAULT_TIMEOUT_MS = 3000

/** Reintentos por defecto. */
const DEFAULT_MAX_RETRIES = 3

/** Backoff base por defecto (200ms). */
const DEFAULT_BACKOFF_MS = 200

/** Fallos consecutivos antes de abrir el circuit breaker. */
const CIRCUIT_BREAKER_THRESHOLD = 5

/** Tiempo de espera antes de probar reconexión tras abrir el circuito (30s). */
const CIRCUIT_RESET_MS = 30_000

/** Estado del circuit breaker. */
const enum CircuitState {
  Closed,
  Open,
  HalfOpen,
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Cliente TCP efímero para dispositivos ELM327 con retry y circuit breaker.
 * Cada `sendCommand` abre una nueva conexión, envía el comando,
 * espera la respuesta hasta el prompt `>`, y cierra la conexión.
 *
 * Fail-safe patterns:
 * - Retry con backoff exponencial en fallos de conexión (ECONNREFUSED, timeout).
 * - Circuit breaker: tras 5 fallos consecutivos, rechaza comandos durante 30s.
 */
export function createElm327TcpClient(config: Elm327TcpConfig) {
  const timeoutMs = config.timeout ?? DEFAULT_TIMEOUT_MS
  const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES
  const backoffMs = config.backoffMs ?? DEFAULT_BACKOFF_MS

  let circuitState = CircuitState.Closed
  let failureCount = 0
  let openedAt = 0

  function openCircuit(): void {
    circuitState = CircuitState.Open
    openedAt = Date.now()
  }

  function tryHalfOpen(): boolean {
    if (circuitState !== CircuitState.Open) return true
    if (Date.now() - openedAt >= CIRCUIT_RESET_MS) {
      circuitState = CircuitState.HalfOpen
      return true
    }
    return false
  }

  function onSuccess(): void {
    circuitState = CircuitState.Closed
    failureCount = 0
  }

  function onFailure(): void {
    failureCount++
    if (failureCount >= CIRCUIT_BREAKER_THRESHOLD) {
      openCircuit()
    }
  }

  /** Envía un comando ELM327 y resuelve con la respuesta cruda (hasta el prompt ">"). */
  function sendCommandOnce(cmd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = createConnection({ host: config.host, port: config.port })
      let data = ''
      const timer = setTimeout(() => {
        socket.destroy()
        reject(
          new Elm327ConnectionError(
            `ELM327 timeout (${timeoutMs}ms) after command "${cmd}" on ${config.host}:${config.port}`,
          ),
        )
      }, timeoutMs)
      socket.on('data', (chunk: Buffer) => {
        data += chunk.toString()
        if (data.includes('>')) {
          clearTimeout(timer)
          socket.destroy()
          resolve(data)
        }
      })
      socket.on('error', (err: Error) => {
        clearTimeout(timer)
        socket.destroy()
        const code = (err as NodeJS.ErrnoException).code
        reject(
          new Elm327ConnectionError(
            `ELM327 connection error (${code ?? err.message}) on ${config.host}:${config.port}`,
          ),
        )
      })
      socket.write(`${cmd}\r\n`)
    })
  }

  /** Envía un comando con retry + circuit breaker. */
  async function sendCommand(cmd: string): Promise<string> {
    if (!tryHalfOpen()) {
      const elapsed = Math.round((Date.now() - openedAt) / 1000)
      throw new Elm327ConnectionError(
        `ELM327 circuit open on ${config.host}:${config.port} — rejecting for ${elapsed}s (reset in ~${Math.max(0, CIRCUIT_RESET_MS / 1000 - elapsed)}s)`,
      )
    }

    let lastError: unknown
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await sendCommandOnce(cmd)
        onSuccess()
        return result
      } catch (err) {
        lastError = err
        if (attempt < maxRetries) {
          await sleep(backoffMs * Math.pow(2, attempt))
        }
      }
    }

    onFailure()
    throw lastError
  }

  return { sendCommand }
}
