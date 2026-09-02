/**
 * Parsing de respuestas ELM327, portado de
 * `apps/core-api/src/infrastructure/elm327/protocol.ts` para el transporte USB
 * nativo (Android). Puerto verbatim: solo cambian los imports relativos.
 */
import { isEcuResponseAddress, looksLikeCanAddress } from './ecuAddressCatalog'
import { Elm327BusError, Elm327NoDataError, Elm327ParseError } from './errors'

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

/** Lanza si la respuesta cruda es un fallo del bus en vez de datos. */
export function assertNoBusError(raw: string): void {
  for (const [pattern, reason] of BUS_ERRORS) {
    if (pattern.test(raw)) throw new Elm327BusError(reason, raw)
  }
}

const HEX_TOKEN_RE = /^[0-9A-F]{1,2}$/i

/** Parsea una secuencia de bytes hex separados por espacios ("0C 80" → [0x0C, 0x80]). */
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

/** Limpia la respuesta cruda: quita echo, prompt y lineas vacias. */
export function stripEcho(raw: string): string {
  return raw
    .split(/\r\n?|\n/)
    .map((l) => l.trim())
    .filter((l) => l && l !== '>' && l !== 'OK' && !l.startsWith('AT'))
    .filter((_l, idx, arr) => !(idx === 0 && arr.length > 1))
    .join('\n')
}

const MODE_01_LINE_RE = /^4[0-9A-F]\s+[0-9A-F]{2}\s+/i
const VIN_LINE_RE = /^49\s+02\s+01\s+/i
const HEX_BYTES_GROUP_SRC = '([0-9A-F]{2}(?:\\s+[0-9A-F]{2})*)'

/** Itera las lineas "N: <hex>" de una respuesta multi-frame y concatena los bytes de datos. */
export function parseMultiLineResponse(raw: string, linePrefix: RegExp): number[] {
  assertNoBusError(raw)
  if (/NO DATA/i.test(raw)) throw new Elm327NoDataError(raw)
  const payload: number[] = []
  for (const line of raw.split(/\r\n?|\n/)) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
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
  const match = cleaned.match(new RegExp(`4[0-9A-F]\\s+[0-9A-F]{2}\\s+${HEX_BYTES_GROUP_SRC}`, 'i'))
  if (!match) throw new Elm327ParseError(raw)
  return parseHexBytes(match[1])
}

/** Entrada de una linea de respuesta Mode 01: codigo de PID + bytes de datos. */
export interface ModeResponseEntry {
  readonly pid: string
  readonly bytes: number[]
}

/** Parsea una respuesta Mode 01 multi-PID linea a linea. */
export function parseModeResponseEntries(raw: string): ModeResponseEntry[] {
  assertNoBusError(raw)
  const entries: ModeResponseEntry[] = []
  for (const line of raw.split(/\r\n?|\n/)) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const lineHex = line.slice(idx + 1).trim()
    const match = lineHex.match(/^4[0-9A-F]\s+([0-9A-F]{2})\s+(.+)$/i)
    if (!match) continue
    entries.push({ pid: match[1].toUpperCase(), bytes: parseHexBytes(match[2]) })
  }
  return entries
}

/** Mode 22 UDS: extrae los bytes de payload tras `62 XX XX`. */
export function parseMode22Response(raw: string, didLen: number): number[] {
  assertNoBusError(raw)
  const cleaned = stripEcho(raw)
  if (/NO DATA/i.test(cleaned)) throw new Elm327NoDataError(raw)
  const match = cleaned.match(
    new RegExp(`62\\s+[0-9A-F]{2}\\s+[0-9A-F]{2}\\s+${HEX_BYTES_GROUP_SRC}`, 'i'),
  )
  if (!match) throw new Elm327ParseError(raw)
  const bytes = parseHexBytes(match[1])
  return didLen > 0 ? bytes.slice(0, didLen) : bytes
}

/** Mode 09 02: extrae los bytes ASCII del VIN desde lineas `N:` o formato single-line. */
export function parseVinResponse(raw: string): number[] {
  const payload = parseMultiLineResponse(raw, VIN_LINE_RE)
  if (payload.length > 0) return payload
  const cleaned = stripEcho(raw)
  const hexMatch = cleaned.match(/49\s*02\s*01\s+((?:[0-9A-F]{2}\s*)+)/i)
  if (hexMatch) return parseHexBytes(hexMatch[1])
  return []
}

/** Extrae pares de 2 bytes (cada par = un DTC) de una respuesta Mode 03, 07 o 0A. */
export function parseDtcResponse(raw: string, mode: DtcMode = '03'): Array<[number, number]> {
  assertNoBusError(raw)
  const cleaned = stripEcho(raw)
  if (/NO DATA/i.test(cleaned)) return []
  const match = cleaned.match(buildDtcDataRe(mode))
  if (!match) throw new Elm327ParseError(raw)
  return toDtcPairs(parseHexBytes(match[1]))
}

/** Modos de lectura de DTC: almacenados, pendientes y permanentes. */
export type DtcMode = '03' | '07' | '0A'

function dtcResponseByte(mode: DtcMode): string {
  return (0x40 + Number.parseInt(mode, 16)).toString(16).toUpperCase()
}

function buildDtcDataRe(mode: DtcMode): RegExp {
  return new RegExp(`${dtcResponseByte(mode)}\\s+${HEX_BYTES_GROUP_SRC}`, 'i')
}

/** Codigos de averia de una ECU concreta, tal como llegan del bus. */
export interface EcuDtcGroup {
  readonly ecuAddress?: string
  readonly pairs: Array<[number, number]>
}

function toDtcPairs(bytes: number[]): Array<[number, number]> {
  const pairs: Array<[number, number]> = []
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    pairs.push([bytes[i], bytes[i + 1]])
  }
  return pairs
}

function splitDtcLine(line: string): { address?: string; payload: string } | null {
  const trimmed = line.trim()
  if (trimmed === '' || trimmed === '>') return null
  const [first, ...rest] = trimmed.split(/\s+/)
  if (isEcuResponseAddress(first)) {
    return { address: first.toUpperCase(), payload: rest.join(' ') }
  }
  if (looksLikeCanAddress(first)) return null
  return { payload: trimmed }
}

function parseDtcLine(line: string, dataRe: RegExp): EcuDtcGroup | null {
  const split = splitDtcLine(line)
  if (split === null) return null
  const match = dataRe.exec(split.payload)
  if (match === null) return null
  const pairs = toDtcPairs(parseHexBytes(match[1]))
  return pairs.length > 0 ? { ecuAddress: split.address, pairs } : null
}

/** Parsea una lectura de DTC agrupando por la ECU que responde (requiere `AT H1`). */
export function parseDtcResponseByEcu(raw: string, mode: DtcMode = '03'): EcuDtcGroup[] {
  assertNoBusError(raw)
  if (/NO DATA/i.test(raw)) return []
  const dataRe = buildDtcDataRe(mode)
  const groups = raw
    .split(/\r\n?|\n/)
    .map((line) => parseDtcLine(line, dataRe))
    .filter((group): group is EcuDtcGroup => group !== null)
  if (groups.length === 0) throw new Elm327ParseError(raw)
  return groups
}

/** Parsea un bitmask de PIDs soportados (Mode 01, PID `00`/`20`/`40`/`60`). */
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

/** Indica si un bitmask declara soporte para el rango siguiente. */
export function declaresNextPidRange(bytes: number[]): boolean {
  if (bytes.length === 0) return false
  return (bytes[bytes.length - 1] & 1) === 1
}

const CAN_HEADER_LINE_RE = /^([0-9A-F]{8}|[0-9A-F]{3})(?:\s|$)/i

/** Extrae los headers CAN unicos de una respuesta con `AT H1` activo. */
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
