import type { LiveData } from '@/domain/entities/liveData.js'

/** Error lanzado cuando falla el parseo de una trama hexadecimal. */
export class ParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ParseError'
  }
}

const MIN_RPM = 0
const MAX_RPM = 10_000
const MIN_TEMP = -40
const MAX_TEMP = 150
const MIN_SPEED = 0
const MAX_SPEED = 255

const HEX_RE = /^[0-9A-F]+$/i

function hexToByte(hex: string): number {
  if (!HEX_RE.test(hex)) {
    throw new ParseError(`Invalid hex characters: "${hex}"`)
  }
  const byte = Number.parseInt(hex, 16)
  if (Number.isNaN(byte)) {
    throw new ParseError(`Invalid hex value: "${hex}"`)
  }
  return byte
}

/** Convierte 4 caracteres hex (2 bytes) a RPM según SAE J1979: (A*256+B)/4. */
export function parseRpm(hex: string): number {
  if (hex.length !== 4) {
    throw new ParseError(`RPM requires 4 hex chars, got ${hex.length}`)
  }
  const a = hexToByte(hex.slice(0, 2))
  const b = hexToByte(hex.slice(2, 4))
  const rpm = (a * 256 + b) / 4
  if (rpm < MIN_RPM || rpm > MAX_RPM) {
    throw new ParseError(`RPM ${rpm} out of range [${MIN_RPM}, ${MAX_RPM}]`)
  }
  return rpm
}

/** Convierte 2 caracteres hex a temperatura de refrigerante (°C): raw - 40. */
export function parseCoolantTemp(hex: string): number {
  if (hex.length !== 2) {
    throw new ParseError(`Coolant temperature requires 2 hex chars, got ${hex.length}`)
  }
  const temp = hexToByte(hex) - 40
  if (temp < MIN_TEMP || temp > MAX_TEMP) {
    throw new ParseError(`Coolant temperature ${temp}°C out of range [${MIN_TEMP}, ${MAX_TEMP}]`)
  }
  return temp
}

/** Convierte 2 caracteres hex a velocidad (km/h) — mapeo directo. */
export function parseSpeed(hex: string): number {
  if (hex.length !== 2) {
    throw new ParseError(`Speed requires 2 hex chars, got ${hex.length}`)
  }
  const speed = hexToByte(hex)
  if (speed < MIN_SPEED || speed > MAX_SPEED) {
    throw new ParseError(`Speed ${speed} km/h out of range [${MIN_SPEED}, ${MAX_SPEED}]`)
  }
  return speed
}

/** Convierte 2 caracteres hex a temperatura de admisión (°C): raw - 40. */
export function parseIntakeTemp(hex: string): number {
  if (hex.length !== 2) {
    throw new ParseError(`Intake air temperature requires 2 hex chars, got ${hex.length}`)
  }
  const temp = hexToByte(hex) - 40
  if (temp < MIN_TEMP || temp > MAX_TEMP) {
    throw new ParseError(`Intake air temperature ${temp}°C out of range [${MIN_TEMP}, ${MAX_TEMP}]`)
  }
  return temp
}

/** Parsea una trama completa de 10 caracteres hex (5 bytes) y devuelve LiveData. */
export function parseAllPids(hex: string): LiveData {
  if (hex.length === 0) {
    throw new ParseError('Empty frame — no data to parse')
  }
  if (hex.length !== 10) {
    throw new ParseError(`Expected 10 hex chars (5 bytes), got ${hex.length}`)
  }

  const normalized = hex.toUpperCase()
  const rpm = parseRpm(normalized.slice(0, 4))
  const coolantTemp = parseCoolantTemp(normalized.slice(4, 6))
  const speed = parseSpeed(normalized.slice(6, 8))
  const intakeTemp = parseIntakeTemp(normalized.slice(8, 10))

  return { rpm, coolantTemp, speed, intakeTemp }
}
