import { isEcuResponseAddress, looksLikeCanAddress } from '@/domain/catalogs/ecuAddressCatalog.js'
import { Elm327BusError, Elm327NoDataError, Elm327ParseError } from './errors.js'

/**
 * Respuestas del ELM327 que no son datos sino un fallo del enlace con el
 * vehiculo, con la explicacion que se le enseña a quien esta delante del coche.
 *
 * Sin esta traduccion todas caian en {@link Elm327ParseError}, que dice
 * "respuesta ilegible" y manda a buscar un bug inexistente en el parser.
 */
const BUS_ERRORS: ReadonlyArray<readonly [RegExp, string]> = [
  [
    /UNABLE TO CONNECT/i,
    'El adaptador no consigue abrir el bus del vehiculo. Comprueba que el contacto este puesto y que el conector OBD asiente bien.',
  ],
  [
    /BUS INIT|BUS ERROR/i,
    'Fallo al inicializar el bus del vehiculo. Revisa el conector OBD y vuelve a intentarlo.',
  ],
  [/CAN ERROR/i, 'Error en el bus CAN del vehiculo. Suele ser conector flojo o protocolo erroneo.'],
  [
    /BUS BUSY/i,
    'El bus del vehiculo esta ocupado y no acepta la peticion. Reintenta en unos segundos.',
  ],
  [
    /DATA ERROR/i,
    'Datos corruptos en la respuesta del vehiculo. Suele indicar interferencias o mal contacto.',
  ],
  [
    /BUFFER FULL/i,
    'Desbordamiento del buffer del adaptador: llegan mas datos de los que puede procesar.',
  ],
  [/STOPPED/i, 'Lectura interrumpida por el adaptador antes de completarse.'],
  [/LV RESET/i, 'El adaptador se ha reiniciado por tension baja. Revisa la bateria del vehiculo.'],
]

/**
 * Lanza si la respuesta cruda es un fallo del bus en vez de datos.
 *
 * Se comprueba antes que cualquier parseo: estas respuestas son texto plano y
 * no encajan en ningun formato de datos, asi que llegarian al final como
 * "ilegible" perdiendo por el camino la unica pista util.
 *
 * @param raw - Respuesta cruda del adaptador ELM327.
 * @throws {Elm327BusError} Si la respuesta es uno de los fallos de bus conocidos.
 */
export function assertNoBusError(raw: string): void {
  for (const [pattern, reason] of BUS_ERRORS) {
    if (pattern.test(raw)) throw new Elm327BusError(reason, raw)
  }
}

/** Valida que un token hexadecimal tenga exactamente 1 o 2 dígitos [0-9A-F] case-insensitive. */
const HEX_TOKEN_RE = /^[0-9A-F]{1,2}$/i

/**
 * Parsea una secuencia de bytes hex separados por espacios ("0C 80" → [0x0C, 0x80]).
 *
 * @param hex - Cadena con bytes hexadecimales separados por espacios.
 * @returns Array de números (0-255) correspondientes a cada byte válido.
 * @throws {Elm327ParseError} Si algún token no es un byte hexadecimal válido (1 o 2 dígitos hex).
 */
export function parseHexBytes(hex: string): number[] {
  return hex
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      if (!HEX_TOKEN_RE.test(token)) {
        throw new Elm327ParseError(token)
      }
      return Number.parseInt(token, 16)
    })
}

/** Formatea un PID a comando ELM327: "0C" → "0C", "1130" → "11 30". */
export function formatCommand(mode: string, pid: string): string {
  const clean = pid.replace(/\s/g, '').toUpperCase()
  const pairs = clean.match(/.{1,2}/g) ?? [clean]
  return `${mode} ${pairs.join(' ')}`
}

/** Limpia la respuesta cruda: quita echo, prompt y líneas vacías. */
export function stripEcho(raw: string): string {
  return raw
    .split(/\r\n?|\n/)
    .map((l) => l.trim())
    .filter((l) => l && l !== '>' && l !== 'OK' && !l.startsWith('AT'))
    .filter((_l, idx, arr) => !(idx === 0 && arr.length > 1)) // elimina la primera línea (echo del comando)
    .join('\n')
}

/** Prefijo de línea Mode 01: byte de respuesta (4X) + PID (YY) al inicio de cada línea. */
const MODE_01_LINE_RE = /^4[0-9A-F]\s+[0-9A-F]{2}\s+/i

/** Prefijo de línea VIN Mode 09: "49 02 01" (mode + pid + count). */
const VIN_LINE_RE = /^49\s+02\s+01\s+/i

/**
 * Itera las líneas "N: <hex>" de una respuesta multi-frame y concatena los bytes
 * de datos, quitando el prefijo `linePrefix` del inicio de cada línea.
 *
 * Salta las líneas sin prefijo "N:" (echo del comando, cabecera, prompt `>`).
 *
 * @param raw - Respuesta cruda del adaptador ELM327.
 * @param linePrefix - Expresión regular del prefijo a eliminar de cada línea de datos.
 * @returns Bytes de datos concatenados de todas las líneas (vacío si no hay líneas multi-frame).
 * @throws {Elm327NoDataError} Si la respuesta contiene "NO DATA".
 */
export function parseMultiLineResponse(raw: string, linePrefix: RegExp): number[] {
  assertNoBusError(raw)
  if (/NO DATA/i.test(raw)) throw new Elm327NoDataError(raw)
  const payload: number[] = []
  for (const line of raw.split(/\r\n?|\n/)) {
    const idx = line.indexOf(':')
    if (idx === -1) continue // salta echo, cabecera y prompt
    const dataHex = line
      .slice(idx + 1)
      .trim()
      .replace(linePrefix, '')
      .trim()
    if (dataHex) payload.push(...parseHexBytes(dataHex))
  }
  return payload
}

/** Mode 01: extrae los bytes de datos tras `4X YY` (ignora headers si aparecen). */
export function parseModeResponse(raw: string): number[] {
  const payload = parseMultiLineResponse(raw, MODE_01_LINE_RE)
  if (payload.length > 0) return payload

  const cleaned = stripEcho(raw)
  if (/^7F\s/i.test(cleaned)) throw new Elm327ParseError(raw)
  const match = cleaned.match(/4[0-9A-F]\s+[0-9A-F]{2}\s+([0-9A-F]{2}(?:\s+[0-9A-F]{2})*)/i)
  if (!match) throw new Elm327ParseError(raw)
  return parseHexBytes(match[1])
}

/** Entrada de una línea de respuesta Mode 01: código de PID + bytes de datos. */
export interface ModeResponseEntry {
  readonly pid: string
  readonly bytes: number[]
}

/**
 * Parsea una respuesta Mode 01 multi-PID línea a línea.
 *
 * Cada línea `N: 4X YY <data>` se mapea a `{ pid: YY, bytes: <data> }`. Las líneas
 * `NO DATA` (PID no soportado) se omiten para permitir la degradación por PID en
 * {@code readPids}, a diferencia de {@link parseModeResponse} que lanza.
 *
 * @param raw - Respuesta cruda del adaptador ELM327.
 * @returns Entradas PID → bytes en orden de aparición.
 */
export function parseModeResponseEntries(raw: string): ModeResponseEntry[] {
  assertNoBusError(raw)
  const entries: ModeResponseEntry[] = []
  for (const line of raw.split(/\r\n?|\n/)) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const lineHex = line.slice(idx + 1).trim()
    const match = lineHex.match(/^4[0-9A-F]\s+([0-9A-F]{2})\s+(.+)$/i)
    if (!match) continue // línea "NO DATA" o sin formato "4X YY ..."
    entries.push({ pid: match[1].toUpperCase(), bytes: parseHexBytes(match[2]) })
  }
  return entries
}

/** Mode 22 UDS: extrae los bytes de payload tras `62 XX XX`. */
export function parseMode22Response(raw: string, didLen: number): number[] {
  assertNoBusError(raw)
  const cleaned = stripEcho(raw)
  if (/NO DATA/i.test(cleaned)) throw new Elm327NoDataError(raw)
  const match = cleaned.match(/62\s+[0-9A-F]{2}\s+[0-9A-F]{2}\s+([0-9A-F]{2}(?:\s+[0-9A-F]{2})*)/i)
  if (!match) throw new Elm327ParseError(raw)
  const bytes = parseHexBytes(match[1])
  return didLen > 0 ? bytes.slice(0, didLen) : bytes
}

/** Mode 09 02: extrae los bytes ASCII del VIN desde líneas `N:` / `0:`..`N:` o formato single-line. */
export function parseVinResponse(raw: string): number[] {
  const payload = parseMultiLineResponse(raw, VIN_LINE_RE)
  if (payload.length > 0) return payload
  // Single-line response: adaptador devuelve 49 02 01 ... sin prefijos de línea
  const cleaned = stripEcho(raw)
  const hexMatch = cleaned.match(/49\s*02\s*01\s+((?:[0-9A-F]{2}\s*)+)/i)
  if (hexMatch) return parseHexBytes(hexMatch[1])
  return []
}

/**
 * Extrae pares de 2 bytes (cada par = un DTC) de una respuesta Mode 03, 07 o 0A.
 *
 * El header de respuesta es `0x40 + mode`. Por defecto usa Mode 03 (header `43`).
 * Mode 07 usa header `47` y Mode 0A usa header `4A`.
 *
 * @param raw - Respuesta cruda del adaptador ELM327.
 * @param mode - Modo OBD-II (`'03'`, `'07'`, `'0A'`). Por defecto `'03'`.
 * @returns Pares de bytes DTC. Array vacio si no hay codigos (`NO DATA`).
 * @throws {Elm327ParseError} Si la respuesta no contiene el header esperado.
 * @throws {Elm327BusError} Si el bus falla — distinto de "no hay averias".
 */
export function parseDtcResponse(raw: string, mode: DtcMode = '03'): Array<[number, number]> {
  assertNoBusError(raw)
  const cleaned = stripEcho(raw)
  if (/NO DATA/i.test(cleaned)) return []
  const match = cleaned.match(
    new RegExp(`${dtcResponseByte(mode)}\\s+((?:[0-9A-F]{2}\\s+)*[0-9A-F]{2})`, 'i'),
  )
  if (!match) throw new Elm327ParseError(raw)
  return toDtcPairs(parseHexBytes(match[1]))
}

/** Modos de lectura de DTC: almacenados, pendientes y permanentes. */
export type DtcMode = '03' | '07' | '0A'

/** Byte con el que la ECU encabeza su respuesta a un modo de lectura (`03` → `43`). */
function dtcResponseByte(mode: DtcMode): string {
  return (0x40 + Number.parseInt(mode, 16)).toString(16).toUpperCase()
}

/** Codigos de averia de una ECU concreta, tal como llegan del bus. */
export interface EcuDtcGroup {
  /** Direccion de respuesta de la ECU que los reporta. Ausente si los headers estaban apagados. */
  readonly ecuAddress?: string
  /** Pares de bytes sin decodificar, en orden de aparicion. */
  readonly pairs: Array<[number, number]>
}

/** Empareja los bytes de datos de un DTC: cada dos bytes, un codigo. */
function toDtcPairs(bytes: number[]): Array<[number, number]> {
  const pairs: Array<[number, number]> = []
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    pairs.push([bytes[i], bytes[i + 1]])
  }
  return pairs
}

/**
 * Parsea una lectura de DTC agrupando por la ECU que responde.
 *
 * Es la variante de {@link parseDtcResponse} para cuando el modo se emite con
 * `AT H1`: en vez de aplanar todos los codigos en una lista, conserva de quien
 * viene cada uno, que es lo que permite marcar la ECU averiada en el mapa de
 * topologia. Sin headers no se pierde nada — los codigos salen igual, con el
 * origen ausente.
 *
 * Las direcciones se validan con {@link isEcuResponseAddress}, la misma regla que
 * usa el barrido de ECUs, asi que una peticion colada en la traza (`18DB33F1`) no
 * se confunde con una respuesta.
 *
 * @param raw - Respuesta cruda del adaptador ELM327.
 * @param mode - Modo emitido: `03` almacenados, `07` pendientes, `0A` permanentes.
 * @returns Un grupo por ECU que responde, en orden de aparicion.
 * @throws {Elm327ParseError} Si ninguna linea lleva el byte de respuesta del modo.
 */
/**
 * Separa el header de una linea de respuesta.
 *
 * @returns `null` si la linea no aporta datos: vacia, el prompt, o encabezada por
 *   una direccion que no es una respuesta de diagnostico.
 */
function splitDtcLine(line: string): { address?: string; payload: string } | null {
  const trimmed = line.trim()
  if (trimmed === '' || trimmed === '>') return null
  const [first, ...rest] = trimmed.split(/\s+/)
  if (isEcuResponseAddress(first)) {
    return { address: first.toUpperCase(), payload: rest.join(' ') }
  }
  // Una direccion con forma valida que no sea respuesta —una peticion colada en la
  // traza— invalida la linea entera: sus datos no vienen de ninguna ECU.
  if (looksLikeCanAddress(first)) return null
  return { payload: trimmed }
}

/** Extrae el grupo de codigos de una linea, o `null` si no lleva ninguno. */
function parseDtcLine(line: string, dataRe: RegExp): EcuDtcGroup | null {
  const split = splitDtcLine(line)
  if (split === null) return null
  const match = dataRe.exec(split.payload)
  if (match === null) return null
  const pairs = toDtcPairs(parseHexBytes(match[1]))
  return pairs.length > 0 ? { ecuAddress: split.address, pairs } : null
}

/**
 * Parsea una lectura de DTC agrupando por la ECU que responde.
 *
 * Es la variante de {@link parseDtcResponse} para cuando el modo se emite con
 * `AT H1`: en vez de aplanar todos los codigos en una lista, conserva de quien
 * viene cada uno, que es lo que permite marcar la ECU averiada en el mapa de
 * topologia. Sin headers no se pierde nada — los codigos salen igual, con el
 * origen ausente.
 *
 * @param raw - Respuesta cruda del adaptador ELM327.
 * @param mode - Modo emitido: `03` almacenados, `07` pendientes, `0A` permanentes.
 * @returns Un grupo por ECU que responde, en orden de aparicion.
 * @throws {Elm327ParseError} Si ninguna linea lleva el byte de respuesta del modo.
 */
export function parseDtcResponseByEcu(raw: string, mode: DtcMode = '03'): EcuDtcGroup[] {
  assertNoBusError(raw)
  if (/NO DATA/i.test(raw)) return []
  const dataRe = new RegExp(`${dtcResponseByte(mode)}\\s+((?:[0-9A-F]{2}\\s+)*[0-9A-F]{2})`, 'i')
  const groups = raw
    .split(/\r\n?|\n/)
    .map((line) => parseDtcLine(line, dataRe))
    .filter((group): group is EcuDtcGroup => group !== null)
  if (groups.length === 0) throw new Elm327ParseError(raw)
  return groups
}

/**
 * Parsea un bitmask de PIDs soportados (Mode 01, PID `00`/`20`/`40`/`60`).
 * Cada byte representa 8 PIDs, donde el bit más significativo es el PID más bajo.
 *
 * @param bytes - Los bytes de datos tras el header Mode 01 (ej: [0xB8, 0x3B, 0xA8, 0x13]).
 * @param offset - PID desde el que numera este bitmask: `0x00` para el rango 01-20,
 *   `0x20` para 21-40, `0x40` para 41-60. Los cuatro bitmask son identicos en forma y
 *   solo se distinguen por donde empiezan a contar; sin esto, el de 21-40 renumeraba
 *   01-20 por segunda vez.
 * @returns Lista de comandos PID formateados (ej: `["01 01", "01 03", ...]`).
 */
export function parseSupportedPidBitmask(bytes: number[], offset = 0): string[] {
  const pids: string[] = []
  for (let i = 0; i < bytes.length; i++) {
    for (let bit = 7; bit >= 0; bit--) {
      if ((bytes[i] >> bit) & 1) {
        const pid = offset + i * 8 + (7 - bit) + 1
        pids.push(`01 ${pid.toString(16).padStart(2, '0').toUpperCase()}`)
      }
    }
  }
  return pids
}

/**
 * Indica si un bitmask declara soporte para el rango siguiente.
 *
 * El ultimo bit del bitmask (PID `20`, `40`, `60`...) no es un parametro: es la marca
 * de continuacion que dice si tiene sentido preguntar por el rango de arriba. Leerla es
 * lo que permite **preguntar en vez de imponer**, en la linea del ADR 009.
 */
export function declaresNextPidRange(bytes: number[]): boolean {
  if (bytes.length === 0) return false
  return (bytes[bytes.length - 1] & 1) === 1
}

/**
 * Header CAN al inicio de línea con `AT H1`: 8 dígitos hex (29 bits) o 3 (11 bits),
 * seguidos de espacio o fin. El de 29 bits va primero para no depender del backtracking.
 */
const CAN_HEADER_LINE_RE = /^([0-9A-F]{8}|[0-9A-F]{3})(?:\s|$)/i

/**
 * Extrae los headers CAN únicos de una respuesta con `AT H1` activo.
 *
 * Cada línea de respuesta empieza por el CAN ID de la ECU que responde: 3 dígitos
 * hex en 11 bits (`7E8`) u 8 en 29 bits (`18DAF110`). Se devuelven en orden de
 * aparición y sin duplicados, filtrados por {@link isEcuResponseAddress}: fuera
 * quedan los 11-bit fuera del rango `7E8-7EF` (`7E7`, `7DA`, `768`, `7F0`) y los
 * 29-bit que no van dirigidos al equipo de diagnóstico, que son las peticiones
 * (`18DB33F1`, `18DA10F1`) y todo lo que no sea diagnóstico ISO 15765-4. Las
 * líneas vacías y el prompt `>` también se descartan.
 *
 * @param raw - Respuesta cruda del adaptador ELM327.
 * @returns Lista de headers CAN (ej. `['7E8', '7E9']`), vacía si no hay ninguno.
 */
export function parseCanHeaders(raw: string): string[] {
  const headers: string[] = []
  const seen = new Set<string>()
  for (const line of raw.split(/\r\n?|\n/)) {
    const match = CAN_HEADER_LINE_RE.exec(line.trim())
    if (!match) continue
    const header = match[1].toUpperCase()
    if (!isEcuResponseAddress(header) || seen.has(header)) continue
    seen.add(header)
    headers.push(header)
  }
  return headers
}
