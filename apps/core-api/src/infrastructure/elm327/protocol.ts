import { Elm327NoDataError, Elm327ParseError } from './errors.js'

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
  if (/NO DATA/i.test(raw)) throw new Elm327NoDataError(raw)
  const payload: number[] = []
  for (const line of raw.split(/\r\n?|\n/)) {
    const idx = line.indexOf(':')
    if (idx === -1) continue // salta echo, cabecera y prompt
    const dataHex = line.slice(idx + 1).trim().replace(linePrefix, '').trim()
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
 */
export function parseDtcResponse(
  raw: string,
  mode: '03' | '07' | '0A' = '03',
): Array<[number, number]> {
  const headerByte = (0x40 + Number.parseInt(mode, 16)).toString(16).toUpperCase()
  const cleaned = stripEcho(raw)
  if (/NO DATA/i.test(cleaned)) return []
  const match = cleaned.match(new RegExp(`${headerByte}\\s+((?:[0-9A-F]{2}\\s+)*[0-9A-F]{2})`, 'i'))
  if (!match) throw new Elm327ParseError(raw)
  const bytes = parseHexBytes(match[1])
  const pairs: Array<[number, number]> = []
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    pairs.push([bytes[i], bytes[i + 1]])
  }
  return pairs
}

/**
 * Parsea el bitmask de PIDs soportados (Mode 01, PID 00).
 * Cada byte representa 8 PIDs, donde el bit más significativo es el PID más bajo.
 *
 * @param bytes - Los bytes de datos tras el header Mode 01 (ej: [0xB8, 0x3B, 0xA8, 0x13]).
 * @returns Lista de comandos PID formateados (ej: `["01 01", "01 03", ...]`).
 */
export function parseSupportedPidBitmask(bytes: number[]): string[] {
  const pids: string[] = []
  for (let i = 0; i < bytes.length; i++) {
    for (let bit = 7; bit >= 0; bit--) {
      if ((bytes[i] >> bit) & 1) {
        const pid = i * 8 + (7 - bit) + 1
        pids.push(`01 ${pid.toString(16).padStart(2, '0').toUpperCase()}`)
      }
    }
  }
  return pids
}

/** Header CAN al inicio de línea con `AT H1`: exactamente 3 dígitos hex seguidos de espacio o fin. */
const CAN_HEADER_LINE_RE = /^([0-9A-F]{3})(?:\s|$)/i

/** Límite inferior del rango ISO 15765-4 de direcciones de respuesta OBD (`0x7E8`). */
const CAN_RESPONSE_ADDR_MIN = 0x7e8

/** Límite superior del rango ISO 15765-4 de direcciones de respuesta OBD (`0x7EF`). */
const CAN_RESPONSE_ADDR_MAX = 0x7ef

/** Comprueba si una dirección CAN está dentro del rango de respuesta OBD ISO 15765-4 (`7E8-7EF`). */
function isObdResponseAddr(addr: number): boolean {
  return addr >= CAN_RESPONSE_ADDR_MIN && addr <= CAN_RESPONSE_ADDR_MAX
}

/**
 * Extrae los headers CAN únicos de una respuesta con `AT H1` activo.
 *
 * Cada línea de respuesta empieza por el CAN ID (3 dígitos hex) de la ECU que
 * responde. Solo se devuelven direcciones de respuesta OBD dentro del rango
 * estándar ISO 15765-4 `7E8-7EF`, en orden de aparición y sin duplicados.
 * Cualquier header 11-bit fuera de ese rango (p. ej. `7E7`, `7DA`, `768`,
 * `7F0`) y los headers 29-bit (p. ej. `18DAF110`) se descartan. Las líneas
 * vacías y el prompt `>` también se descartan.
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
    const addr = Number.parseInt(header, 16)
    if (!isObdResponseAddr(addr) || seen.has(header)) continue
    seen.add(header)
    headers.push(header)
  }
  return headers
}
