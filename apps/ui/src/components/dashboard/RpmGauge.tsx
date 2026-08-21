import { Gauge } from 'lucide-react'
import { useAnimatedNumber } from './useAnimatedNumber'
import { COLORS, GAUGE, SVG_STROKES } from './types'
import { clampPct } from '@/lib/utils'

type GaugeGeometry = {
  r: number
  cx: number
  cy: number
  startX: number
  endX: number
}

function gaugeGeo(): GaugeGeometry {
  const { SVG_RADIUS: r, SVG_CENTER_X: cx, SVG_CENTER_Y: cy } = GAUGE
  return { r, cx, cy, startX: cx - r, endX: cx + r }
}

function renderTicks(g: GaugeGeometry) {
  const { r, cx, cy } = g
  return Array.from({ length: GAUGE.TICK_COUNT }).map((_, i) => {
    const a = ((-180 + (i / (GAUGE.TICK_COUNT - 1)) * 180) * Math.PI) / 180
    return (
      <line
        key={i}
        x1={cx + (r + 6) * Math.cos(a)}
        y1={cy + (r + 6) * Math.sin(a)}
        x2={cx + (r + 14) * Math.cos(a)}
        y2={cy + (r + 14) * Math.sin(a)}
        stroke={SVG_STROKES.tickLine}
        strokeWidth="1.5"
      />
    )
  })
}

type SvgProps = {
  g: GaugeGeometry
  pct: number
  danger: boolean
  angle: number
  /** Start of the red zone as a fraction of the dial, or `null` when there is no threshold. */
  dangerPct: number | null
}

function GaugeSVG({ g, pct, danger, angle, dangerPct }: SvgProps) {
  const { r, cx, cy, startX, endX } = g
  const progAngle = -180 + pct * 180
  const progEndX = cx + r * Math.cos((progAngle * Math.PI) / 180)
  const progEndY = cy + r * Math.sin((progAngle * Math.PI) / 180)
  const stroke = danger ? COLORS.destructive : COLORS.primary

  return (
    <svg viewBox="0 0 200 120" className="w-full max-w-[260px]">
      <path
        d={`M ${startX} ${cy} A ${r} ${r} 0 0 1 ${endX} ${cy}`}
        fill="none"
        stroke={SVG_STROKES.bgArc}
        strokeWidth="10"
        strokeLinecap="round"
      />
      {dangerPct !== null && (
        <path
          d={`M ${cx + r * Math.cos(((-180 + dangerPct * 180) * Math.PI) / 180)} ${cy + r * Math.sin(((-180 + dangerPct * 180) * Math.PI) / 180)} A ${r} ${r} 0 0 1 ${endX} ${cy}`}
          fill="none"
          stroke={SVG_STROKES.dangerZone}
          strokeWidth="10"
          strokeLinecap="round"
        />
      )}
      {pct > 0 && (
        <path
          d={`M ${startX} ${cy} A ${r} ${r} 0 ${pct > 0.5 ? 1 : 0} 1 ${progEndX} ${progEndY}`}
          fill="none"
          stroke={stroke}
          strokeWidth="10"
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${stroke})` }}
        />
      )}
      {renderTicks(g)}
      <g transform={`rotate(${angle} ${cx} ${cy})`}>
        <line
          x1={cx}
          y1={cy}
          x2={cx}
          y2={cy - r + 6}
          stroke={stroke}
          strokeWidth="3"
          strokeLinecap="round"
          style={{ filter: 'drop-shadow(0 0 4px currentColor)' }}
        />
      </g>
      <circle cx={cx} cy={cy} r="7" fill={COLORS.background} stroke={stroke} strokeWidth="2" />
    </svg>
  )
}

/**
 * Animated SVG semicircle gauge displaying engine RPM with danger zone indicator.
 *
 * @param dangerAt - Upper bound of the healthy window, from the PID catalog served
 *   by the API. Without it neither the red zone nor the danger styling is drawn:
 *   where the redline sits is the domain's call, not the gauge's.
 */
export function RpmGauge({
  value,
  loading,
  dangerAt,
}: {
  value: number | null
  loading: boolean
  dangerAt?: number
}) {
  const display = useAnimatedNumber(value)
  const v = value ?? 0
  const pct = clampPct(display / GAUGE.RPM_MAX)
  const angle = -90 + pct * 180
  const danger = dangerAt !== undefined && v > dangerAt
  const dangerPct = dangerAt === undefined ? null : clampPct(dangerAt / GAUGE.RPM_MAX)
  const g = gaugeGeo()

  return (
    <div
      className="panel relative flex flex-col p-4"
      title={`Régimen del motor. Rango normal en ralentí: 650–950 RPM.${dangerAt !== undefined ? ` Anómalo > ${dangerAt} RPM.` : ''}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          <Gauge className="h-3.5 w-3.5 text-primary" />
          RPM
        </div>
        <span className="mono text-[10px] text-muted-foreground">
          0–{GAUGE.RPM_MAX.toLocaleString()}
        </span>
      </div>
      <div className="relative mt-1 flex justify-center">
        <GaugeSVG g={g} pct={pct} danger={danger} angle={angle} dangerPct={dangerPct} />
      </div>
      <div className="-mt-4 flex items-baseline justify-center gap-2">
        <span
          className={`mono text-4xl font-bold tracking-tight ${danger ? 'text-destructive' : 'text-foreground'}`}
        >
          {loading ? '----' : Math.round(display).toLocaleString()}
        </span>
        <span className="mono text-xs text-muted-foreground">rpm</span>
      </div>
    </div>
  )
}
