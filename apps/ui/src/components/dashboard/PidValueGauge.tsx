import { Activity } from 'lucide-react'

interface Props {
  readonly name: string
  readonly unit: string
  readonly value: number | null
}

/** Generic gauge for PIDs without a dedicated widget: name + value + unit, `—` when null. */
export function PidValueGauge({ name, unit, value }: Props) {
  const display = value === null ? '—' : String(Math.round(value))
  return (
    <div className="panel relative flex flex-col p-4" title={name}>
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        <Activity className="h-3.5 w-3.5 text-primary" />
        {name}
      </div>
      <div className="mt-4 flex flex-1 items-baseline justify-center rounded-lg border border-white/5 bg-black/40 px-4 py-5">
        <span className="mono text-4xl font-bold leading-none text-foreground">{display}</span>
        {unit ? <span className="mono ml-2 text-xs text-muted-foreground">{unit}</span> : null}
      </div>
    </div>
  )
}
