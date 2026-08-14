import type { Elm327TraceEntry } from './reliableTransport.js'

/**
 * Seguimiento visual de la conexion con el adaptador, una linea por intercambio.
 *
 * No registra nada: escribe y olvida. Existe para mirar el enlace mientras se
 * trabaja sobre el vehiculo, asi que no pasa por el {@link LoggerPort}, que
 * persiste cada llamada en SQLite y ahogaria la base de datos a varios
 * intercambios por segundo.
 */

/** Destino de la traza. Inyectable para poder probar el formato sin ensuciar la consola. */
export type TraceWriter = (line: string) => void

/** Deja la respuesta cruda en una sola linea legible, sin prompt ni vacios. */
function flatten(raw: string, cmd: string): string {
  return raw
    .split(/\r\n?|\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '' && l !== '>' && l !== cmd)
    .join(' | ')
}

/**
 * Crea un observador de traza que pinta cada intercambio en una linea.
 *
 * @param source - Etiqueta del transporte, para distinguirlos cuando hay varios.
 * @param write - Destino de la linea. Por defecto la salida estandar.
 * @returns Observador apto para `onTrace` de {@link createReliableTransport}.
 */
export function createConsoleTracer(
  source: string,
  write: TraceWriter = (line) => console.log(line),
): (entry: Elm327TraceEntry) => void {
  return (entry) => {
    const head = `[obd:${source}] > ${entry.cmd.padEnd(10)} ${String(entry.durationMs).padStart(5)}ms`
    if (entry.error !== undefined) {
      write(`${head}  ✗ ERROR ${entry.error}`)
      return
    }
    write(`${head}  < ${flatten(entry.raw ?? '', entry.cmd)}`)
  }
}
