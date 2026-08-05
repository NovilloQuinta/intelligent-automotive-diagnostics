import { createConnection } from 'node:net'
import { Elm327ConnectionError } from './errors.js'

/** Configuración del transporte TCP al dispositivo ELM327. */
export interface Elm327TcpConfig {
  readonly host: string
  readonly port: number
  /** Timeout por comando en ms (default 3000). */
  readonly timeout?: number
}

/** Timeout por defecto para comandos TCP (3 segundos). */
export const DEFAULT_TIMEOUT_MS = 3000

/**
 * Cliente TCP efímero para dispositivos ELM327.
 * Cada `sendCommand` abre una nueva conexión, envía el comando,
 * espera la respuesta hasta el prompt `>`, y cierra la conexión.
 */
export function createElm327TcpClient(config: Elm327TcpConfig) {
  const timeoutMs = config.timeout ?? DEFAULT_TIMEOUT_MS

  /** Envía un comando ELM327 y resuelve con la respuesta cruda (hasta el prompt ">"). */
  function sendCommand(cmd: string): Promise<string> {
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

  return { sendCommand }
}
