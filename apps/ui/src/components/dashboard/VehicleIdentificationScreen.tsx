import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { VehicleAutoDetectWizard } from './VehicleAutoDetectWizard'
import { ScenariosErrorBanner } from './ScenariosErrorBanner'
import type { useVehicleAutoDetect } from './useVehicleAutoDetect'
import type { Scenario } from './types'

interface Props {
  readonly scenarios: Scenario[]
  readonly selectedId: string
  readonly scenariosError: string | null
  readonly loading: boolean
  readonly wizard: ReturnType<typeof useVehicleAutoDetect>
  readonly onVehicleConfirmed: (scenarioId: string) => void
  readonly onLogout: () => void
}

/** Pantalla previa al dashboard: identifica el vehículo antes de abrir el menú de diagnóstico. */
export function VehicleIdentificationScreen({
  scenarios,
  selectedId,
  scenariosError,
  loading,
  wizard,
  onVehicleConfirmed,
  onLogout,
}: Props) {
  return (
    <DashboardLayout
      activeSection="vehicle"
      onSectionChange={() => {}}
      scenarios={scenarios}
      selectedId={selectedId}
      onSelectVehicle={wizard.detect}
      telemetry={{ loading, streamOk: false }}
      onLogout={onLogout}
    >
      <ScenariosErrorBanner message={scenariosError} />
      <VehicleAutoDetectWizard
        scenarios={scenarios}
        step={wizard.step}
        scenarioId={wizard.scenarioId}
        vehicle={wizard.vehicle}
        error={wizard.error}
        onSelect={wizard.detect}
        onRetry={wizard.retry}
        onBack={wizard.restart}
        onConfirm={onVehicleConfirmed}
        onSaveIdentity={wizard.saveIdentity}
      />
    </DashboardLayout>
  )
}
