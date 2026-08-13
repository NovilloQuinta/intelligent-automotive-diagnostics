import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { PidObservation } from '@/lib/api'
import type { DiagnosisResponse, PidReading } from './types'
import { COLORS, GAUGE } from './types'

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

/** Builds the full `"01 XX"` code from a short Mode 01 PID code. */
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

/** Extracts the short PID code from a full `"01 0C"` code (drops the mode prefix). */
export function shortPidCode(code: string): string {
  return code.split(' ')[1] ?? code
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

/** Builds the fixed PID rows read during a diagnosis session from its parsed OBD-II values. */
export function buildPidRows(parsedValues: DiagnosisResponse['parsedValues']): PidRow[] {
  const { rpm, coolantTemp, speed, intakeTemp } = parsedValues
  const rows = [
    {
      code: mode01Code(PID_RPM),
      description: 'Régimen del motor',
      value: `${rpm} RPM`,
      status: rpm > GAUGE.RPM_DANGER ? 'review' : 'ok',
    },
    {
      code: mode01Code(PID_COOLANT),
      description: 'Temperatura del refrigerante',
      value: `${coolantTemp}°C`,
      status: coolantTemp > GAUGE.COOLANT_ALARM ? 'review' : 'ok',
    },
    {
      code: mode01Code(PID_SPEED),
      description: 'Velocidad del vehículo',
      value: `${speed} km/h`,
      status: 'ok',
    },
    {
      code: mode01Code(PID_INTAKE),
      description: 'Temperatura del aire de admisión',
      value: `${intakeTemp}°C`,
      status: intakeTemp > GAUGE.INTAKE_WARN ? 'review' : 'ok',
    },
  ] satisfies Omit<PidRow, 'source'>[]

  return rows.map((row) => ({ ...row, source: 'fixed' }))
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
  availablePids: readonly { code: string; name: string; unit: string }[],
  parsedValues: DiagnosisResponse['parsedValues'] | null,
  readings: readonly PidReading[] | null | undefined,
): PidRow[] {
  const fixedRows = parsedValues ? buildPidRows(parsedValues) : []
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
      status: null,
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
