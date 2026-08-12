import { Car, Activity, AlertTriangle, Snowflake, Cpu, Stethoscope, FileText } from 'lucide-react'

export type SidebarSection =
  'vehicle' | 'live-data' | 'dtc' | 'freeze-frame' | 'ecu' | 'diagnosis' | 'report'

interface SidebarItem {
  readonly id: SidebarSection
  readonly label: string
  readonly icon: typeof Car
}

const SECTIONS: SidebarItem[] = [
  { id: 'vehicle', label: 'Vehículo', icon: Car },
  { id: 'live-data', label: 'Datos Vivo', icon: Activity },
  { id: 'dtc', label: 'Códigos DTC', icon: AlertTriangle },
  { id: 'freeze-frame', label: 'Freeze Frame', icon: Snowflake },
  { id: 'ecu', label: 'Unidades Control', icon: Cpu },
  { id: 'diagnosis', label: 'Diagnóstico', icon: Stethoscope },
  { id: 'report', label: 'Informe', icon: FileText },
]

interface SidebarProps {
  readonly active: SidebarSection
  readonly onChange: (section: SidebarSection) => void
  readonly dtcCount?: number
  readonly hasDiagnosis?: boolean
}

export function Sidebar({ active, onChange, dtcCount, hasDiagnosis }: SidebarProps) {
  return (
    <aside className="flex w-16 flex-col border-r border-white/5 bg-black/40 py-3">
      {SECTIONS.map((item) => {
        const isActive = active === item.id
        const Icon = item.icon

        return (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            className="relative flex flex-col items-center gap-1 px-1 py-3 text-muted-foreground transition-colors hover:text-foreground"
            title={item.label}
          >
            <Icon className={`h-5 w-5 ${isActive ? 'text-primary' : ''}`} />
            <span
              className={`text-[9px] font-medium leading-none ${isActive ? 'text-primary' : ''}`}
            >
              {item.label}
            </span>
            {isActive && (
              <span className="absolute right-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
            )}
            {item.id === 'dtc' && dtcCount ? (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                {dtcCount}
              </span>
            ) : null}
            {item.id === 'diagnosis' && hasDiagnosis && (
              <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary" />
            )}
          </button>
        )
      })}
    </aside>
  )
}
