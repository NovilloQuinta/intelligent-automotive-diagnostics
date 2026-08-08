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

/** Mode 01: extrae los bytes de datos tras `4X YY` (ignora headers si aparecen). */
export function parseModeResponse(raw: string): number[] {
  const cleaned = stripEcho(raw)
  if (/NO DATA/i.test(cleaned)) throw new Elm327NoDataError(raw)
  if (/^7F\s/i.test(cleaned)) throw new Elm327ParseError(raw)
  const match = cleaned.match(/4[0-9A-F]\s+[0-9A-F]{2}\s+([0-9A-F]{2}(?:\s+[0-9A-F]{2})*)/i)
  if (!match) throw new Elm327ParseError(raw)
  return parseHexBytes(match[1])
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
  const cleaned = stripEcho(raw)
  if (/NO DATA/i.test(cleaned)) throw new Elm327NoDataError(raw)
  const payload: number[] = []
  for (const line of cleaned.split('\n')) {
    const idx = line.indexOf(':')
    if (idx === -1) continue // salta cabecera "014" y líneas sin prefijo
    payload.push(...parseHexBytes(line.slice(idx + 1)))
  }
  // Single-line response: adaptador devuelve 49 02 01 ... sin prefijos de línea
  if (payload.length === 0) {
    const hexMatch = cleaned.match(/49\s*02\s*01\s+((?:[0-9A-F]{2}\s*)+)/i)
    if (hexMatch) {
      payload.push(...parseHexBytes(hexMatch[1]))
    }
  }
  // Quita el prefijo "49 02 01" (mode + pid + count) de la primera línea si existe
  if (payload.length >= 3 && payload[0] === 0x49 && payload[1] === 0x02 && payload[2] === 0x01) {
    return payload.slice(3)
  }
  return payload
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
export function parseDtcResponse(raw: string, mode: '03' | '07' | '0A' = '03'): Array<[number, number]> {
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
