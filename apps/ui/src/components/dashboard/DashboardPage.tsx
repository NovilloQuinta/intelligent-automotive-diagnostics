import { useEffect, useRef, useState } from 'react'
import { Navigate } from '@tanstack/react-router'
import { useAuth } from '@/lib/auth-context'
import { useScenarios } from './useScenarios'
import { useAvailablePids } from './useAvailablePids'
import { DEFAULT_LIVE_PIDS } from './pidCatalog'
import { useVehicleAutoDetect } from './useVehicleAutoDetect'
import { useLiveTelemetry } from './useLiveTelemetry'
import { useDiagnosis } from './useDiagnosis'
import { useCapabilities } from './useCapabilities'
import { useCognitiveDiagnosis } from './useCognitiveDiagnosis'
import { useEcuInfo } from './useEcuInfo'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { DashboardSection } from './DashboardSection'
import { VehicleIdentificationScreen } from './VehicleIdentificationScreen'
import { ScenariosErrorBanner } from './ScenariosErrorBanner'
import type { SidebarSection } from '@/components/layout/Sidebar'

/** Compone todos los hooks del dashboard (telemetria, DTCs, diagnosis, ECUs) y los pasa a DashboardSection. */
export function DashboardPage() {
  const auth = useAuth()

  const { scenarios, selectedId, setSelectedId, scenariosError } = useScenarios()
  const selectedScenario = scenarios.find((s) => s.id === selectedId) ?? null
  const availablePids = useAvailablePids()
  const [selectedPids, setSelectedPids] = useState<readonly string[]>(DEFAULT_LIVE_PIDS)
  const { live, streamOk, readings } = useLiveTelemetry(selectedId, selectedPids)
  const { loading, result, runDiagnosis } = useDiagnosis(selectedId)
  const { cognitiveDiagnosis } = useCapabilities()
  const cognitive = useCognitiveDiagnosis(selectedId)
  const { ecus, loading: ecusLoading, error: ecusError } = useEcuInfo(selectedId)
  const [selectedDtc, setSelectedDtc] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<SidebarSection>('live-data')
  const wizard = useVehicleAutoDetect()

  const resetCognitiveRef = useRef(cognitive.reset)
  const triggerCognitiveRef = useRef(cognitive.trigger)

  // Mantiene los refs sincronizados con el último reset()/trigger() sin mutar durante el render.
  useEffect(() => {
    resetCognitiveRef.current = cognitive.reset
    triggerCognitiveRef.current = cognitive.trigger
  })

  useEffect(() => {
    setSelectedDtc(null)
    setSelectedPids(DEFAULT_LIVE_PIDS)
    // Al confirmar vehículo se limpia el hilo cognitivo anterior y se lanza uno nuevo de fondo.
    if (selectedId) {
      resetCognitiveRef.current()
      void triggerCognitiveRef.current()
    }
  }, [selectedId])

  /** Recoge los fallos crudos (DTCs, datos en vivo) sin lanzar la IA. */
  const handleDiagnose = () => {
    void runDiagnosis()
  }

  const handleChatSend = (q: string) => {
    void cognitive.trigger(q)
  }

  /** Lanza un diagnóstico IA nuevo: sesión nueva, sin query ni historial. */
  const handleLaunchDiagnosis = () => {
    void cognitive.trigger()
  }

  const handleVehicleConfirmed = (scenarioId: string) => {
    setSelectedId(scenarioId)
    wizard.confirm()
  }

  const handleDtcSelect = (code: string) => {
    setSelectedDtc(code)
    setActiveSection('freeze-frame')
  }

  if (auth.status === 'anonymous') {
    return <Navigate to="/login" replace />
  }

  const rpm = live?.rpm ?? result?.parsedValues.rpm ?? null
  const coolant = live?.coolantTemp ?? result?.parsedValues.coolantTemp ?? null
  const speed = live?.speed ?? result?.parsedValues.speed ?? null
  const intake = live?.intakeTemp ?? result?.parsedValues.intakeTemp ?? null
  const rawSummary = live?.rawData ?? result?.rawData ?? null

  const vehicleReady = wizard.step === 'done'
  const dtcCodes = result?.dtcCodes ?? null
  const hasDiagnosis = result !== null
  const dtcCount = dtcCodes?.length ?? 0
  const canLaunch = hasDiagnosis && !!selectedId

  if (!vehicleReady) {
    return (
      <VehicleIdentificationScreen
        scenarios={scenarios}
        selectedId={selectedId}
        scenariosError={scenariosError}
        loading={loading}
        wizard={wizard}
        onVehicleConfirmed={handleVehicleConfirmed}
        onLogout={() => auth.logout()}
      />
    )
  }

  return (
    <DashboardLayout
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      dtcCount={dtcCount}
      hasDiagnosis={hasDiagnosis}
      scenarios={scenarios}
      selectedId={selectedId}
      onSelectVehicle={wizard.detect}
      telemetry={{ loading, streamOk }}
      onLogout={() => auth.logout()}
    >
      <ScenariosErrorBanner message={scenariosError} />
      <DashboardSection
        activeSection={activeSection}
        selectedId={selectedId}
        selectedScenario={selectedScenario}
        telemetry={{ rpm, coolant, speed, intake, rawSummary, pids: selectedPids, readings }}
        pidSelection={{ selectedPids, onPidsChange: setSelectedPids, availablePids }}
        diagnosis={{ loading, streamOk, result, dtcCodes, selectedDtc }}
        cognitive={{
          severity: cognitive.severity,
          confidence: cognitive.confidence,
          conversationHistory: cognitive.conversationHistory,
          loading: cognitive.loading,
          error: cognitive.error,
          pidRows: cognitive.pidRows,
          available: !!cognitiveDiagnosis,
        }}
        ecu={{ ecus, loading: ecusLoading, error: ecusError }}
        onDiagnose={handleDiagnose}
        onDtcSelect={handleDtcSelect}
        onChatSend={handleChatSend}
        onLaunchDiagnosis={handleLaunchDiagnosis}
        canLaunch={canLaunch}
      />
    </DashboardLayout>
  )
}
