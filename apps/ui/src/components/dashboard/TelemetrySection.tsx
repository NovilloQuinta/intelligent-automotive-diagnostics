import { Fragment } from 'react'
import { Activity } from 'lucide-react'
import { RpmGauge } from './RpmGauge'
import { CoolantBar } from './CoolantBar'
import { SpeedDisplay } from './SpeedDisplay'
import { IntakeThermo } from './IntakeThermo'
import { PidValueGauge } from './PidValueGauge'
import { DiagnoseButton } from './DiagnoseButton'
import { COLORS, type PidReading, type AvailablePid } from './types'
import {
  DEFAULT_LIVE_PIDS,
  PID_RPM,
  PID_COOLANT,
  PID_SPEED,
  PID_INTAKE,
  mode01Code,
  pidWindows,
} from './pidCatalog'

type TelemetryValues = {
  rpm: number | null
  coolant: number | null
  speed: number | null
  intake: number | null
}

type Props = {
  values: TelemetryValues
  rawSummary: string | null
  loading: boolean
  streamOk: boolean
  canDiagnose: boolean
  telemetryStatus: string
  onDiagnose: () => void
  /** Short Mode 01 codes to render (no mode prefix). Defaults to {@link DEFAULT_LIVE_PIDS}. */
  pids?: readonly string[]
  /** Generic readings from `GET /api/live-data`, used for PIDs without a dedicated gauge. */
  readings?: readonly PidReading[] | null
  /**
   * PID catalog from `GET /api/available-pids`, which carries the operating window
   * each gauge paints its alert zone from. Empty until it loads: gauges then render
   * the reading with no alert, rather than inventing a threshold.
   */
  availablePids?: readonly AvailablePid[]
}

/** Maps a short PID code to its dedicated gauge, falling back to the generic {@link PidValueGauge}. */
function renderGauge(
  pid: string,
  values: TelemetryValues,
  loading: boolean,
  readings: readonly PidReading[] | null | undefined,
  windows: ReadonlyMap<string, { readonly min?: number; readonly max?: number }>,
) {
  const upperBound = (shortCode: string) => windows.get(mode01Code(shortCode))?.max

  switch (pid) {
    case PID_RPM:
      return (
        <RpmGauge
          value={values.rpm}
          loading={loading && values.rpm == null}
          dangerAt={upperBound(PID_RPM)}
        />
      )
    case PID_COOLANT:
      return (
        <CoolantBar
          value={values.coolant}
          loading={loading && values.coolant == null}
          alarmAt={upperBound(PID_COOLANT)}
        />
      )
    case PID_SPEED:
      return <SpeedDisplay value={values.speed} loading={loading && values.speed == null} />
    case PID_INTAKE:
      return (
        <IntakeThermo
          value={values.intake}
          loading={loading && values.intake == null}
          warnAt={upperBound(PID_INTAKE)}
        />
      )
    default: {
      const reading = readings?.find((r) => r.code.toUpperCase() === `01 ${pid}`)
      return (
        <PidValueGauge
          name={reading?.name ?? `PID ${pid}`}
          unit={reading?.unit ?? ''}
          value={reading?.value ?? null}
        />
      )
    }
  }
}

function LiveBadge({ streamOk, loading }: { streamOk: boolean; loading: boolean }) {
  if (!streamOk || loading) return null
  return (
    <span className="ml-2 inline-flex items-center gap-1.5 rounded-md border border-[#00d4aa]/30 bg-[#00d4aa]/10 px-2 py-0.5">
      <span className="led-dot h-1.5 w-1.5 rounded-full" style={{ background: COLORS.accent }} />
      <span
        className="mono text-[10px] font-bold uppercase tracking-widest"
        style={{ color: COLORS.accent }}
      >
        En Vivo
      </span>
    </span>
  )
}

/** Left panel: live telemetry gauges + diagnose button with streaming status. */
export function TelemetrySection({
  values,
  rawSummary,
  loading,
  streamOk,
  canDiagnose,
  telemetryStatus,
  onDiagnose,
  pids,
  readings = null,
  availablePids = [],
}: Props) {
  const activePids = pids ?? DEFAULT_LIVE_PIDS
  const windows = pidWindows(availablePids)
  return (
    <section
      className={`panel relative flex flex-col self-start overflow-hidden p-4 md:p-5 ${loading ? 'scanning' : ''}`}
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-[0.15em]">Telemetría en vivo</h2>
          <LiveBadge streamOk={streamOk} loading={loading} />
        </div>
        <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {telemetryStatus}
        </div>
      </div>
      <div
        className={`relative grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 ${loading ? 'scan-sweep' : ''}`}
      >
        {activePids.map((pid) => (
          <Fragment key={pid}>{renderGauge(pid, values, loading, readings, windows)}</Fragment>
        ))}
      </div>
      <DiagnoseButton
        loading={loading}
        disabled={!canDiagnose}
        onClick={onDiagnose}
        rawSummary={rawSummary}
      />
    </section>
  )
}
