import { useEffect, useRef, useState } from 'react'
import { Bike, Car, ChevronDown } from 'lucide-react'
import type { Scenario } from './types'

function VehicleIcon({ type }: { type: Scenario['type'] }) {
  return type === 'moto' ? <Bike className="h-4 w-4 text-primary" /> : <Car className="h-4 w-4 text-primary" />
}

function DropdownOption({ s, value, onChange, onClose }: {
  s: Scenario; value: string; onChange: (id: string) => void; onClose: () => void
}) {
  return (
    <button
      onClick={() => { onChange(s.id); onClose() }}
      className={`flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-white/5 ${s.id === value ? 'bg-white/[0.04]' : ''}`}
    >
      <VehicleIcon type={s.type} />
      <div className="flex-1">
        <div className="text-sm">{s.name}</div>
        <div className="mono text-[10px] uppercase tracking-wider text-muted-foreground">{s.plate} · {s.year}</div>
      </div>
    </button>
  )
}

type Props = {
  scenarios: Scenario[]
  value: string
  onChange: (id: string) => void
  disabled: boolean
}

/** Dropdown vehicle selector with car/moto icons, plate info, and click-outside dismissal. */
/** Calls callback when a mousedown event occurs outside the given ref element. */
function useClickOutside(ref: React.RefObject<HTMLDivElement | null>, callback: () => void) {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) callback()
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [ref, callback])
}

/** Dropdown vehicle selector with car/moto icons, plate info, and click-outside dismissal. */
export function VehicleSelector({ scenarios, value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = scenarios.find((s) => s.id === value)
  useClickOutside(ref, () => setOpen(false))

  return (
    <div ref={ref} className="relative">
      <button
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex min-w-[240px] items-center gap-3 rounded-md border border-white/10 bg-black/40 px-3 py-2 text-left transition hover:border-primary/40 hover:bg-black/50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <VehicleIcon type={current?.type ?? 'car'} />
        <div className="flex-1">
          <div className="text-sm font-medium">{current?.name ?? 'Seleccionar vehículo'}</div>
          <div className="mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {current ? `${current.plate} · ${current.year}` : '—'}
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-1 w-full overflow-hidden rounded-md border border-white/10 bg-[#161b22] shadow-xl">
          {scenarios.map((s) => (
            <DropdownOption key={s.id} s={s} value={value} onChange={onChange} onClose={() => setOpen(false)} />
          ))}
        </div>
      )}
    </div>
  )
}
