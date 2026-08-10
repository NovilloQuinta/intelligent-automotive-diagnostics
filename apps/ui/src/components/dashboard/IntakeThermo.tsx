import { Thermometer } from 'lucide-react'
import { useAnimatedNumber } from './useAnimatedNumber'
import { GAUGE, GRADIENTS } from './types'
import { clampPct } from '@/lib/utils'

/** Horizontal bar showing intake air temperature with warning threshold. */
export function IntakeThermo({ value, loading }: { value: number | null; loading: boolean }) {
  const display = useAnimatedNumber(value)
  const v = value ?? 0
  const pct = clampPct(display / GAUGE.INTAKE_MAX)
  const warn = v > GAUGE.INTAKE_WARN

  return (
    <div
      className="panel relative flex flex-col p-4"
      title="Temperatura del aire de admisión. Óptimo: 20–50°C."
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          <Thermometer className="h-3.5 w-3.5 text-primary rotate-90" />
          Admisión
        </div>
        <span className="mono text-[10px] text-muted-foreground">°C</span>
      </div>

      <div className="mt-4 flex flex-1 flex-col justify-center gap-3">
        <div className="relative h-6 w-full overflow-hidden rounded-full border border-white/10 bg-black/40">
          <div
            className="absolute inset-y-0 left-0 transition-[width] duration-300"
            style={{
              width: `${pct * 100}%`,
              background: GRADIENTS.intake,
              boxShadow: warn ? GRADIENTS.intakeWarnGlow : GRADIENTS.intakeGlow,
            }}
          />
        </div>
        <div className="flex items-baseline justify-between">
          <span
            className={`mono text-4xl font-bold leading-none ${warn ? 'text-primary' : 'text-foreground'}`}
          >
            {loading ? '--' : Math.round(display)}
          </span>
          <span className="mono text-[10px] text-muted-foreground">0 — {GAUGE.INTAKE_MAX}°C</span>
        </div>
      </div>
    </div>
  )
}
