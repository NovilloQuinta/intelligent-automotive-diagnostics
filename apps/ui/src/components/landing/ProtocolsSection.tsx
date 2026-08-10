import { Cable, Car } from 'lucide-react'
import { SectionLabel } from './landing-utils'

const protocols = ['OBD-II', 'CAN BUS', 'ISO 9141-2', 'KWP2000', 'SAE J1850 PWM', 'SAE J1850 VPW']

export function ProtocolsSection() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <SectionLabel>Compatibilidad</SectionLabel>
        <h2 className="mt-5 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Protocolos soportados
        </h2>
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {protocols.map((p) => (
            <div
              key={p}
              className="rounded-md border border-border bg-foreground/[0.02] px-3 py-4 text-center"
            >
              <Cable className="mx-auto size-4 text-[var(--success)]" />
              <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {p}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-6 flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          <Car className="size-3.5" /> Compatible con vehículos desde 1996 (OBD-II estándar)
        </p>
      </div>
    </section>
  )
}
