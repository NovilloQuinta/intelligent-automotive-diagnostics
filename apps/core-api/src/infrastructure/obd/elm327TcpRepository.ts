import { createConnection } from 'node:net'
import type { ObdRepositoryPort } from '@/application/ports/obdRepository.port.js'
import type { DtcCode } from '@/domain/dtcCode.js'
import { FreezeFrame } from '@/domain/freezeFrame.js'
import type { VehicleInfo } from '@/domain/vehicleProfile.js'
import { Vin, FALLBACK_VIN } from '@/domain/vin.js'
import { STANDARD_MODE_01_PIDS } from '@/infrastructure/persistence/sqlite/seed-pids.js'
import { evaluatePid } from './pidParser.js'
import { decodeVin } from './vinDecoder.js'

/** Error de conexión TCP con el emulador ELM327 (timeout, rechazo, socket error). */
export class Elm327ConnectionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'Elm327ConnectionError'
  }
}

/** El emulador responde "NO DATA" — PID/DTC no soportado. */
export class Elm327NoDataError extends Error {
  constructor(raw: string) {
    super(`ELM327: no data for command (raw: "${raw}")`)
    this.name = 'Elm327NoDataError'
  }
}

/** Respuesta ELM327 ilegible o malformada. */
export class Elm327ParseError extends Error {
  constructor(raw: string) {
    super(`ELM327: unparseable response (raw: "${raw}")`)
    this.name = 'Elm327ParseError'
  }
}

/** Configuración del adaptador TCP. */
export interface Elm327TcpConfig {
  readonly host: string
  readonly port: number
  /** Timeout por comando en ms (default 3000). */
  readonly timeout?: number
}

const DEFAULT_TIMEOUT_MS = 3000

/** Código DTC de placeholder cuando la respuesta ELM327 no identifica el DTC que disparó el freeze frame. */
const UNKNOWN_FREEZE_FRAME_DTC = 'UNKNOWN'

/** Fórmulas VAG Mode 22 (DIDs reales del escenario Audi A3 2.0 TDI, Ross-Tech). */
const VAG_MODE_22_FORMULAS: Record<string, { formula: string; dataBytes: number }> = {
  '1130': { formula: '(A*256+B)/4', dataBytes: 2 }, // Engine Speed
  '115C': { formula: 'A*256+B', dataBytes: 2 }, // Charge Air Pressure — Actual (mbar)
  '115E': { formula: 'A*256+B', dataBytes: 2 }, // Charge Air Pressure — Specified (mbar)
  F430: { formula: 'A', dataBytes: 1 }, // Coolant Temperature (VAG scaling 1:1)
  F432: { formula: 'A', dataBytes: 1 }, // Intake Air Temperature
  F477: { formula: '(A*256+B)*0.01', dataBytes: 2 }, // Fuel Rail Pressure — Actual (bar)
  F47D: { formula: '(A*256+B)*0.01', dataBytes: 2 }, // Fuel Rail Pressure — Specified (bar)
  '1035': { formula: 'A', dataBytes: 1 }, // EGR Duty Cycle — Actual (%)
  '1250': { formula: 'A*256+B', dataBytes: 2 }, // Engine Torque (Nm)
  '1132': { formula: '(A*256+B)*0.01', dataBytes: 2 }, // Injection Quantity (mg/stroke)
  '1184': { formula: 'A*256+B', dataBytes: 2 }, // Intake Air Mass (mg/stroke)
  '1410': { formula: '(A*256+B)*0.01', dataBytes: 2 }, // DPF Soot Mass (g)
  '140E': { formula: 'A*256+B', dataBytes: 2 }, // DPF Differential Pressure (mbar)
  F449: { formula: 'A', dataBytes: 1 }, // Accelerator Pedal Position (%)
  '1462': { formula: '(A*256+B)/100', dataBytes: 2 }, // Battery Voltage (V)
  F40D: { formula: 'A', dataBytes: 1 }, // Vehicle Speed (km/h)
}

/** Parsear una secuencia de bytes hex separados por espacios ("0C 80" → [0x0C, 0x80]). */
function parseHexBytes(hex: string): number[] {
  return hex
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((b) => Number.parseInt(b, 16))
}

/** Int big-endian de todos los bytes (fallback para PIDs sin fórmula conocida). */
function bigEndian(bytes: number[]): number {
  return bytes.reduce((acc, b) => acc * 256 + b, 0)
}

/** Formatea un PID a comando ELM327: "0C" → "0C", "1130" → "11 30". */
function formatCommand(mode: string, pid: string): string {
  const clean = pid.replace(/\s/g, '').toUpperCase()
  const pairs = clean.match(/.{1,2}/g) ?? [clean]
  return `${mode} ${pairs.join(' ')}`
}

/**
 * Adaptador OBD-II sobre TCP al emulador ELM327 (Docker, puerto 35000).
 * Conexión efímera por comando, parseo ELM327 sin headers (AT H0 por defecto),
 * aplicación de fórmulas SAE J1979 + VAG Mode 22, decodificación DTC SAE J2012.
 */
export class Elm327TcpRepository implements ObdRepositoryPort {
  private readonly host: string
  private readonly port: number
  private readonly timeoutMs: number
  private readonly pidFormulas: Map<string, { formula: string; dataBytes: number }>

  constructor(config: Elm327TcpConfig) {
    this.host = config.host
    this.port = config.port
    this.timeoutMs = config.timeout ?? DEFAULT_TIMEOUT_MS
    this.pidFormulas = new Map()
    for (const pid of STANDARD_MODE_01_PIDS) {
      this.pidFormulas.set(pid.pidCode.key, {
        formula: pid.formula,
        dataBytes: pid.dataBytes,
      })
    }
    for (const [did, formula] of Object.entries(VAG_MODE_22_FORMULAS)) {
      this.pidFormulas.set(`22 ${did}`, formula)
    }
  }

  /** Envía un comando ELM327 y resuelve con la respuesta cruda (hasta el prompt ">"). */
  private sendCommand(cmd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = createConnection({ host: this.host, port: this.port })
      let data = ''
      const timer = setTimeout(() => {
        socket.destroy()
        reject(
          new Elm327ConnectionError(
            `ELM327 timeout (${this.timeoutMs}ms) after command "${cmd}" on ${this.host}:${this.port}`,
          ),
        )
      }, this.timeoutMs)
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
            `ELM327 connection error (${code ?? err.message}) on ${this.host}:${this.port}`,
          ),
        )
      })
      socket.write(`${cmd}\r\n`)
    })
  }

  /** Limpia la respuesta cruda: quita echo, prompt y líneas vacías. */
  private static stripEcho(raw: string): string {
    return raw
      .split(/\r\n?|\n/)
      .map((l) => l.trim())
      .filter((l) => l && l !== '>' && l !== 'OK' && !l.startsWith('AT'))
      .join('\n')
  }

  /** Mode 01: extrae los bytes de datos tras `4X YY` (ignora headers si aparecen). */
  private parseModeResponse(raw: string): number[] {
    const cleaned = Elm327TcpRepository.stripEcho(raw)
    if (/NO DATA/i.test(cleaned)) throw new Elm327NoDataError(raw)
    const match = cleaned.match(/4[0-9A-F]\s+[0-9A-F]{2}\s+([0-9A-F]{2}(?:\s+[0-9A-F]{2})*)/i)
    if (!match) throw new Elm327ParseError(raw)
    return parseHexBytes(match[1])
  }

  /** Mode 22 UDS: extrae los bytes de payload tras `62 XX XX`. */
  private parseMode22Response(raw: string, didLen: number): number[] {
    const cleaned = Elm327TcpRepository.stripEcho(raw)
    if (/NO DATA/i.test(cleaned)) throw new Elm327NoDataError(raw)
    const match = cleaned.match(
      /62\s+[0-9A-F]{2}\s+[0-9A-F]{2}\s+([0-9A-F]{2}(?:\s+[0-9A-F]{2})*)/i,
    )
    if (!match) throw new Elm327ParseError(raw)
    const bytes = parseHexBytes(match[1])
    return didLen > 0 ? bytes.slice(0, didLen) : bytes
  }

  /** Mode 09 02: extrae los bytes ASCII del VIN desde líneas `N:` / `0:`..`N:`. */
  private parseVinResponse(raw: string): number[] {
    const cleaned = Elm327TcpRepository.stripEcho(raw)
    if (/NO DATA/i.test(cleaned)) throw new Elm327NoDataError(raw)
    const payload: number[] = []
    for (const line of cleaned.split('\n')) {
      const idx = line.indexOf(':')
      if (idx === -1) continue // salta cabecera "014" y líneas sin prefijo
      payload.push(...parseHexBytes(line.slice(idx + 1)))
    }
    // Quita el prefijo "49 02 01" (mode + pid + count) de la primera línea si existe
    if (payload.length >= 3 && payload[0] === 0x49 && payload[1] === 0x02 && payload[2] === 0x01) {
      return payload.slice(3)
    }
    return payload
  }

  /** Mode 03: extrae pares de 2 bytes (cada par = un DTC). */
  private parseDtcResponse(raw: string): Array<[number, number]> {
    const cleaned = Elm327TcpRepository.stripEcho(raw)
    if (/NO DATA/i.test(cleaned)) return []
    const match = cleaned.match(/43\s+((?:[0-9A-F]{2}\s+)*[0-9A-F]{2})/i)
    if (!match) throw new Elm327ParseError(raw)
    const bytes = parseHexBytes(match[1])
    const pairs: Array<[number, number]> = []
    for (let i = 0; i + 1 < bytes.length; i += 2) {
      pairs.push([bytes[i], bytes[i + 1]])
    }
    return pairs
  }

  /** SAE J2012: decodifica un par de bytes a código DTC (ej. 0x0301 → "P0301"). */
  private decodeDtc(byte1: number, byte2: number): string {
    const categories = ['P', 'C', 'B', 'U']
    const category = categories[(byte1 >> 6) & 0x03]
    const digit1 = (byte1 >> 4) & 0x03
    const digit2 = byte1 & 0x0f
    const digit3 = byte2 >> 4
    const digit4 = byte2 & 0x0f
    return `${category}${digit1}${digit2}${digit3}${digit4}`
  }

  /** Aplica la fórmula del PID (SAE o VAG) o fallback big-endian si es desconocida. */
  private applyPidFormula(mode: string, pid: string, bytes: number[]): number {
    const entry = this.pidFormulas.get(`${mode} ${pid.toUpperCase()}`)
    if (!entry || entry.formula === '') return bigEndian(bytes)
    return evaluatePid(entry.formula, bytes.slice(0, entry.dataBytes))
  }

  /** Lee un PID OBD-II del emulador ELM327 y devuelve su valor fisico. */
  async readPid(mode: string, pid: string): Promise<number> {
    const raw = await this.sendCommand(formatCommand(mode, pid))
    const entry = this.pidFormulas.get(`${mode} ${pid.toUpperCase()}`)
    const bytes =
      mode === '22'
        ? this.parseMode22Response(raw, entry?.dataBytes ?? 0)
        : this.parseModeResponse(raw)
    return this.applyPidFormula(mode, pid, bytes)
  }

  /** Consulta los PIDs soportados por la ECU via comando 01 00. */
  async getSupportedPids(): Promise<string[]> {
    const raw = await this.sendCommand('01 00')
    const bytes = this.parseModeResponse(raw)
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

  /** Devuelve el freeze frame del DTC indicado via comando 02 0C. */
  async getFreezeFrame(dtc?: string): Promise<FreezeFrame | null> {
    const raw = await this.sendCommand('02 0C')
    if (/NO DATA/i.test(raw)) return null
    const bytes = this.parseModeResponse(raw)
    return FreezeFrame.create({
      dtcCode: dtc ?? UNKNOWN_FREEZE_FRAME_DTC,
      pidValues: { '0C': this.applyPidFormula('01', '0C', bytes) },
    })
  }

  /** Lee los codigos DTC almacenados en la ECU via comando 03. */
  async readDtcCodes(): Promise<DtcCode[]> {
    const raw = await this.sendCommand('03')
    return this.parseDtcResponse(raw).map(([b1, b2]) => ({
      code: this.decodeDtc(b1, b2),
      description: '',
    }))
  }

  /** Limpia los codigos DTC de la ECU via comando 04. */
  async clearDtcCodes(): Promise<void> {
    await this.sendCommand('04')
  }

  /** Lee el VIN del vehiculo via comando 09 02. */
  async readVin(): Promise<string> {
    const raw = await this.sendCommand('09 02')
    return decodeVin(this.parseVinResponse(raw))
  }

  /** Obtiene la informacion del vehiculo conectado al emulador. */
  async getVehicleInfo(): Promise<VehicleInfo> {
    try {
      const vin = Vin.create(await this.readVin())
      return {
        make: vin.manufacturer ?? 'unknown',
        model: 'unknown',
        year: vin.modelYear ?? 0,
        engineType: 'unknown',
        vin,
      }
    } catch {
      // VIN ilegible: identificacion desconocida pero diagnóstico funcional
      return {
        make: 'unknown',
        model: 'unknown',
        year: 0,
        engineType: 'unknown',
        vin: Vin.create(FALLBACK_VIN),
      }
    }
  }

  /** Controla el estado de alimentacion del emulador ELM327. */
  async setPower(_on: boolean): Promise<void> {
    // No-op: el adaptador no controla la alimentación del hardware
  }
}
