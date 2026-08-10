import { Zap } from 'lucide-react'
import { useAnimatedNumber } from './useAnimatedNumber'
import { COLORS, GAUGE } from './types'

/** Digital speedometer displaying vehicle speed in km/h with glow effect. */
export function SpeedDisplay({ value, loading }: { value: number | null; loading: boolean }) {
  const display = useAnimatedNumber(value)
  return (
    <div
      className="panel relative flex flex-col p-4"
      title="Velocidad instantánea del vehículo en km/h."
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          <Zap className="h-3.5 w-3.5 text-primary" />
          Velocidad
        </div>
        <span className="mono text-[10px] text-muted-foreground">km/h</span>
      </div>
      <div className="mt-4 flex flex-1 flex-col items-center justify-center rounded-lg border border-white/5 bg-black/40 px-4 py-5">
        <span
          className="mono text-6xl font-bold leading-none"
          style={{
            color: COLORS.accent,
            textShadow: '0 0 12px rgba(0,212,170,0.6), 0 0 2px rgba(0,212,170,0.9)',
            fontFeatureSettings: '"tnum"',
          }}
        >
          {loading ? '---' : String(Math.round(display)).padStart(GAUGE.SPEED_DISPLAY_WIDTH, '0')}
        </span>
        <span className="mono mt-2 text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          km/h
        </span>
      </div>
    </div>
  )
}
