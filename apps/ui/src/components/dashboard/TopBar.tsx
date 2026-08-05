import { ScanLine } from 'lucide-react'
import { useClock } from './useClock'
import { VehicleSelector } from './VehicleSelector'
import { COLORS } from './types'
import type { Scenario } from './types'

const DEFAULT_LOCALE = 'es-ES'

function Branding() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/15 ring-1 ring-primary/40">
        <ScanLine className="h-5 w-5 text-primary" />
      </div>
      <div>
        <div className="text-[15px] font-bold leading-tight tracking-tight">
          Intelligent Automotive <span className="text-primary">Diagnostics</span>
        </div>
        <div className="mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          OBD-II · AI Assisted Workshop Tool
        </div>
      </div>
    </div>
  )
}

function ConnectionStatus() {
  return (
    <div className="flex items-center gap-2 rounded-md border border-white/10 bg-black/40 px-3 py-1.5">
      <span className="led-dot h-2 w-2 rounded-full" style={{ background: COLORS.accent }} />
      <span className="mono text-[11px] font-semibold uppercase tracking-widest" style={{ color: COLORS.accent }}>
        Conectado
      </span>
    </div>
  )
}

type Props = {
  scenarios: Scenario[]
  selectedId: string
  onSelect: (id: string) => void
  loading: boolean
}

/** Application header with branding, connection status indicator, live clock, and vehicle selector. */
export function TopBar({ scenarios, selectedId, onSelect, loading }: Props) {
  const now = useClock()
  const timeStr = now
    ? now.toLocaleTimeString(DEFAULT_LOCALE, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '--:--:--'

  return (
    <header className="relative z-10 flex flex-wrap items-center justify-between gap-4 border-b border-white/5 bg-black/40 px-6 py-3 backdrop-blur">
      <Branding />
      <div className="flex flex-wrap items-center gap-4">
        <ConnectionStatus />
        <div className="mono flex items-center gap-2 rounded-md border border-white/10 bg-black/40 px-3 py-1.5 text-sm">
          <span className="text-muted-foreground text-[10px] uppercase tracking-widest">Hora</span>
          <span className="tabular-nums">{timeStr}</span>
        </div>
        <VehicleSelector scenarios={scenarios} value={selectedId} onChange={onSelect} disabled={loading || scenarios.length === 0} />
      </div>
    </header>
  )
}
