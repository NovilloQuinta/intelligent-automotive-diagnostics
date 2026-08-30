import type { ReactNode } from 'react'
import { Sidebar, type SidebarSection } from './Sidebar'
import { TopBar } from '@/components/dashboard/TopBar'
import type { Scenario } from '@/components/dashboard/types'

/** Estado del stream de telemetría en vivo del vehículo seleccionado. */
interface TelemetryStatus {
  readonly loading: boolean
  readonly streamOk: boolean
}

interface DashboardLayoutProps {
  readonly children: ReactNode
  readonly activeSection: SidebarSection
  readonly onSectionChange: (section: SidebarSection) => void
  readonly dtcCount?: number
  readonly hasDiagnosis?: boolean
  readonly scenarios: Scenario[]
  readonly selectedId: string
  readonly onSelectVehicle: (id: string) => void
  readonly telemetry: TelemetryStatus
  readonly onLogout: () => void
}

/** Shell del dashboard: sidebar + topbar + contenido de la seccion activa. */
export function DashboardLayout({
  children,
  activeSection,
  onSectionChange,
  dtcCount,
  hasDiagnosis,
  scenarios,
  selectedId,
  onSelectVehicle,
  telemetry,
  onLogout,
}: DashboardLayoutProps) {
  return (
    <div className="relative z-10 flex min-h-screen flex-col">
      <div className="print:hidden">
        <TopBar
          scenarios={scenarios}
          selectedId={selectedId}
          onSelect={onSelectVehicle}
          loading={telemetry.loading}
          streamOk={telemetry.streamOk}
          onLogout={onLogout}
        />
      </div>
      <div className="flex flex-1">
        <div className="print:hidden">
          <Sidebar
            active={activeSection}
            onChange={onSectionChange}
            dtcCount={dtcCount}
            hasDiagnosis={hasDiagnosis}
          />
        </div>
        <main className="flex-1 overflow-auto p-4 md:p-6 print:overflow-visible print:p-0">
          {children}
        </main>
      </div>
      <footer className="relative z-10 border-t border-white/5 bg-black/40 px-6 py-2 print:hidden">
        <div className="mono flex flex-wrap items-center justify-between gap-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          <span>Intelligent Automotive Diagnostics</span>
          <span className="flex items-center gap-3">
            <span>Protocolo ISO 15765-4 CAN</span>
            <span>v1.0.0</span>
          </span>
        </div>
      </footer>
    </div>
  )
}
