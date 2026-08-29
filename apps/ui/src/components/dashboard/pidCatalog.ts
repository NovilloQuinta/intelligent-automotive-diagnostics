import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { PidObservation } from '@/lib/api'
import type { AvailablePid, DiagnosisResponse, PidReading } from './types'
import { COLORS } from './types'

export type PidStatus = 'ok' | 'review'

/** Origin of a PID row: the 4 fixed readings, a catalog PID, or one discovered by the AI. */
export type PidSource = 'fixed' | 'ai' | 'catalog'

export type PidRow = {
  code: string
  description: string
  value: string
  /** `null` for catalog PIDs without a diagnosis verdict (no OK/Revisar badge). */
  status: PidStatus | null
  source: PidSource
}

/**
 * Short Mode 01 PID codes for the four fixed readings, without the mode prefix
 * (e.g. `"0C"`). Single source of truth for both {@link DEFAULT_LIVE_PIDS} and
 * {@link FIXED_PID_CODES} so they can never diverge.
 */
export const PID_RPM = '0C'
export const PID_COOLANT = '05'
export const PID_SPEED = '0D'
export const PID_INTAKE = '0F'

/** The four fixed readings in render order (RPM, coolant, speed, intake). */
export const FIXED_PID_SHORT_CODES: readonly string[] = [
  PID_RPM,
  PID_COOLANT,
  PID_SPEED,
  PID_INTAKE,
]

/** Antepone el prefijo de modo `"01 "` a un codigo corto (ej. `"0C"` -> `"01 0C"`). */
export function mode01Code(shortCode: string): string {
  return `01 ${shortCode}`
}

/** Codes always rendered from `DiagnosisResponse.parsedValues` — AI rows never duplicate them. */
export const FIXED_PID_CODES: ReadonlySet<string> = new Set(FIXED_PID_SHORT_CODES.map(mode01Code))

/**
 * Number of Mode 01 PIDs the ELM327 can drain within one 1 Hz poll cycle.
 * Requesting more than this overruns the serial queue (see design D6).
 */
export const MAX_SELECTABLE_PIDS = 8

/**
 * PIDs read by default in live telemetry, in short Mode 01 format without the
 * mode prefix (e.g. `"0C"`). Same format expected by `GET /api/live-data?pids=`.
 */
export const DEFAULT_LIVE_PIDS: readonly string[] = FIXED_PID_SHORT_CODES

/** True when a PID row code is a Mode 01 reading (e.g. `"01 0C"`), not a Mode 22 proprietary one. */
export function isMode01PidCode(code: string): boolean {
  return code.startsWith('01 ')
}

/** Inverso de {@link mode01Code}: quita el prefijo de modo, si lo tiene. */
export function shortPidCode(code: string): string {
  return code.split(' ')[1] ?? code
}

/** Nombre + unidad de un PID Mode 01, para render legible (no hex). */
export type PidLabel = {
  name: string
  unit: string
}

/**
 * Construye un mapa short-PID → `{ name, unit }` a partir del catálogo Mode 01
 * (`GET /api/available-pids`, códigos `"01 XX"`). Las claves de lectura (freeze
 * frame, telemetría) son cortas (`"0C"`), así que se normalizan con
 * {@link shortPidCode}. Los PIDs ausentes del catálogo quedan sin entrada.
 */
export function buildPidLabelMap(availablePids: readonly AvailablePid[]): Map<string, PidLabel> {
  const map = new Map<string, PidLabel>()
  for (const pid of availablePids) {
    map.set(shortPidCode(pid.code), { name: pid.name, unit: pid.unit })
  }
  return map
}

export type PidStatusMeta = {
  label: string
  color: string
  bg: string
  border: string
  icon: typeof CheckCircle2 | typeof AlertTriangle
}

/** Maps a PID status to its visual metadata (color, icon, label, background). `null` → no badge. */
export function pidStatusMeta(status: PidStatus | null): PidStatusMeta | null {
  if (status === null) return null
  if (status === 'review') {
    return {
      label: 'Revisar',
      color: COLORS.warning,
      bg: 'rgba(245,179,1,0.08)',
      border: 'rgba(245,179,1,0.3)',
      icon: AlertTriangle,
    }
  }
  return {
    label: 'OK',
    color: COLORS.accent,
    bg: 'rgba(0,212,170,0.08)',
    border: 'rgba(0,212,170,0.3)',
    icon: CheckCircle2,
  }
}

/**
 * Healthy operating window of a PID, as served by `GET /api/available-pids`.
 *
 * The numbers are the domain's (`PID_OBSERVATION_CATALOG`), never the UI's: the
 * dashboard applies the threshold, it does not decide it. Note this is not the
 * physical range SAE J1979 allows for the sensor — coolant transmits up to 215 °C
 * while its health limit is 100 °C.
 */
export type PidOperatingWindow = {
  readonly min?: number
  readonly max?: number
}

/**
 * Applies a PID's operating window to a reading.
 *
 * @returns `'review'` outside the window, `'ok'` inside it, and `null` when there
 *   is no window to apply — an unjudged PID is not a healthy one, so it renders
 *   with no badge rather than a green one.
 */
export function resolvePidStatus(
  value: number,
  window: PidOperatingWindow | undefined,
): PidStatus | null {
  if (!window || (window.min === undefined && window.max === undefined)) return null
  if (window.min !== undefined && value < window.min) return 'review'
  if (window.max !== undefined && value > window.max) return 'review'
  return 'ok'
}

/** Indexes the operating windows of an `available-pids` catalog by full PID code. */
export function pidWindows(
  availablePids: readonly AvailablePid[],
): ReadonlyMap<string, PidOperatingWindow> {
  const byCode = new Map<string, PidOperatingWindow>()
  for (const pid of availablePids) {
    if (pid.operatingWindow) byCode.set(pid.code.toUpperCase(), pid.operatingWindow)
  }
  return byCode
}

/** Filas de los 4 PIDs fijos (rpm/coolant/speed/intake); el status de cada uno sale de compararlo con su operating window. */
export function buildPidRows(
  parsedValues: DiagnosisResponse['parsedValues'],
  windows: ReadonlyMap<string, PidOperatingWindow>,
): PidRow[] {
  const { rpm, coolantTemp, speed, intakeTemp } = parsedValues
  const rows = [
    {
      code: mode01Code(PID_RPM),
      description: 'Régimen del motor',
      value: `${rpm} RPM`,
      reading: rpm,
    },
    {
      code: mode01Code(PID_COOLANT),
      description: 'Temperatura del refrigerante',
      value: `${coolantTemp}°C`,
      reading: coolantTemp,
    },
    {
      code: mode01Code(PID_SPEED),
      description: 'Velocidad del vehículo',
      value: `${speed} km/h`,
      reading: speed,
    },
    {
      code: mode01Code(PID_INTAKE),
      description: 'Temperatura del aire de admisión',
      value: `${intakeTemp}°C`,
      reading: intakeTemp,
    },
  ]

  return rows.map(({ reading, ...row }) => ({
    ...row,
    status: resolvePidStatus(reading, windows.get(row.code)),
    source: 'fixed' as const,
  }))
}

/** Maps a backend PID observation to a table row tagged as AI-discovered. */
export function pidObservationToRow(obs: PidObservation): PidRow {
  return {
    code: obs.code,
    description: obs.name,
    value: obs.unit ? `${obs.value} ${obs.unit}` : `${obs.value}`,
    status: obs.status,
    source: 'ai',
  }
}

/**
 * Appends the AI-discovered rows after the base ones, dropping any code already
 * rendered as a base PID and deduplicating the AI rows by code (last read wins).
 */
export function mergePidRows(baseRows: PidRow[], aiRows: PidRow[] | null): PidRow[] {
  if (!aiRows || aiRows.length === 0) return baseRows

  const seen = new Set(baseRows.map((row) => row.code))
  const byCode = new Map<string, PidRow>()
  for (const row of aiRows) {
    if (seen.has(row.code)) continue
    byCode.set(row.code, row)
  }

  return [...baseRows, ...byCode.values()]
}

/**
 * Builds the selectable PID rows from the Mode 01 catalog, overlaying the
 * deterministic value (and verdict) for the 4 fixed PIDs and the live reading
 * for the rest. Catalog PIDs without a live reading render `—` with no verdict.
 */
export function buildSelectablePidRows(
  availablePids: readonly AvailablePid[],
  parsedValues: DiagnosisResponse['parsedValues'] | null,
  readings: readonly PidReading[] | null | undefined,
): PidRow[] {
  const windows = pidWindows(availablePids)
  const fixedRows = parsedValues ? buildPidRows(parsedValues, windows) : []
  const fixedByCode = new Map(fixedRows.map((row) => [row.code, row]))
  const readingByCode = new Map((readings ?? []).map((r) => [r.code.toUpperCase(), r]))

  return availablePids.map((pid) => {
    const code = pid.code.toUpperCase()
    const fixed = fixedByCode.get(code)
    if (fixed) return fixed

    const reading = readingByCode.get(code)
    const value = reading?.value
    return {
      code,
      description: pid.name,
      value: value == null ? '—' : reading?.unit ? `${value} ${reading.unit}` : `${value}`,
      status: value == null ? null : resolvePidStatus(value, windows.get(code)),
      source: 'catalog',
    }
  })
}

/**
 * Toggles a short PID code in a selection: removes it when present, appends it
 * when absent and below {@link MAX_SELECTABLE_PIDS}, otherwise leaves the list
 * untouched. Always returns a new array (never mutates the input).
 */
export function togglePid(selectedPids: readonly string[], shortCode: string): string[] {
  if (selectedPids.includes(shortCode)) {
    return selectedPids.filter((pid) => pid !== shortCode)
  }
  if (selectedPids.length >= MAX_SELECTABLE_PIDS) {
    return [...selectedPids]
  }
  return [...selectedPids, shortCode]
}

/**
 * Drops selected short codes that no longer have a visible selectable row (e.g.
 * an AI PID that disappeared after a re-diagnosis). Preserves the input order.
 */
export function pruneOrphanPids(
  selectedPids: readonly string[],
  visibleShortCodes: readonly string[],
): string[] {
  const visible = new Set(visibleShortCodes)
  return selectedPids.filter((pid) => visible.has(pid))
}
