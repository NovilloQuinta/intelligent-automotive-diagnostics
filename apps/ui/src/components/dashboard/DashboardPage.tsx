import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate } from '@tanstack/react-router'
import { useAuth } from '@/lib/auth-context'
import { useScenarios } from './useScenarios'
import { DEFAULT_LIVE_PIDS } from './pidCatalog'
import { useVehicleAutoDetect } from './useVehicleAutoDetect'
import { VehicleAutoDetectWizard } from './VehicleAutoDetectWizard'
import { useLiveTelemetry } from './useLiveTelemetry'
import { useDiagnosis } from './useDiagnosis'
import { useCapabilities } from './useCapabilities'
import { useCognitiveDiagnosis } from './useCognitiveDiagnosis'
import { useEcuInfo } from './useEcuInfo'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { DashboardSection } from './DashboardSection'
import type { SidebarSection } from '@/components/layout/Sidebar'

export function DashboardPage() {
  const auth = useAuth()

  const { scenarios, selectedId, setSelectedId, scenariosError } = useScenarios()
  const selectedScenario = scenarios.find((s) => s.id === selectedId) ?? null
  const [selectedPids, setSelectedPids] = useState<readonly string[]>(DEFAULT_LIVE_PIDS)
  const { live, streamOk, readings } = useLiveTelemetry(selectedId, selectedPids)
  const { loading, result, runDiagnosis } = useDiagnosis(selectedId)
  const { cognitiveDiagnosis } = useCapabilities()
  const cognitive = useCognitiveDiagnosis(selectedId)
  const { ecus, loading: ecusLoading, error: ecusError } = useEcuInfo(selectedId)
  const [selectedDtc, setSelectedDtc] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<SidebarSection>('live-data')
  const wizard = useVehicleAutoDetect()

  const autoDiagnoseRef = useRef({
    runDiagnosis,
    cognitiveDiagnosis,
    reset: cognitive.reset,
    trigger: cognitive.trigger,
  })
  autoDiagnoseRef.current = {
    runDiagnosis,
    cognitiveDiagnosis,
    reset: cognitive.reset,
    trigger: cognitive.trigger,
  }

  useEffect(() => {
    setSelectedDtc(null)
    setSelectedPids(DEFAULT_LIVE_PIDS)
  }, [selectedId])

  useEffect(() => {
    if (!selectedId) return
    const {
      runDiagnosis: run,
      cognitiveDiagnosis: cog,
      reset,
      trigger: trig,
    } = autoDiagnoseRef.current
    reset()
    void (async () => {
      await run()
      if (cog) void trig()
    })()
  }, [selectedId])

  /**
   * El diagnóstico cognitivo se dispara tras el determinista y sin `await`: la
   * respuesta LLM puede tardar hasta 60 s y no debe retrasar la pintura de
   * severidad, DTCs ni de los 4 PIDs fijos.
   */
  const handleDiagnose = useCallback(async () => {
    cognitive.reset()
    await runDiagnosis()
    if (cognitiveDiagnosis) void cognitive.trigger()
  }, [runDiagnosis, cognitiveDiagnosis, cognitive.reset, cognitive.trigger])

  const handleChatSend = useCallback(
    (q: string) => {
      void cognitive.trigger(q)
    },
    [cognitive.trigger],
  )

  const handleVehicleConfirmed = useCallback(
    (scenarioId: string) => {
      setSelectedId(scenarioId)
      wizard.confirm()
    },
    [setSelectedId, wizard.confirm],
  )

  const handleDtcSelect = useCallback((code: string) => {
    setSelectedDtc(code)
    setActiveSection('freeze-frame')
  }, [])

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

  if (!vehicleReady) {
    return (
      <DashboardLayout
        activeSection="vehicle"
        onSectionChange={() => {}}
        scenarios={scenarios}
        selectedId={selectedId}
        onSelectVehicle={wizard.detect}
        telemetry={{ loading, streamOk: false }}
        onLogout={() => auth.logout()}
      >
        {scenariosError && (
          <div className="mb-4 border-b border-destructive/30 bg-destructive/10 px-6 py-2 text-sm text-destructive">
            {scenariosError}
          </div>
        )}
        <VehicleAutoDetectWizard
          scenarios={scenarios}
          step={wizard.step}
          scenarioId={wizard.scenarioId}
          vehicle={wizard.vehicle}
          error={wizard.error}
          onSelect={wizard.detect}
          onRetry={wizard.retry}
          onBack={wizard.restart}
          onConfirm={handleVehicleConfirmed}
        />
      </DashboardLayout>
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
      {scenariosError && (
        <div className="mb-4 border-b border-destructive/30 bg-destructive/10 px-6 py-2 text-sm text-destructive">
          {scenariosError}
        </div>
      )}
      <DashboardSection
        activeSection={activeSection}
        selectedId={selectedId}
        selectedScenario={selectedScenario}
        telemetry={{ rpm, coolant, speed, intake, rawSummary, pids: selectedPids, readings }}
        pidSelection={{ selectedPids, onPidsChange: setSelectedPids }}
        diagnosis={{ loading, streamOk, result, dtcCodes, selectedDtc }}
        cognitive={{
          diagnosisText: cognitive.diagnosisText,
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
      />
    </DashboardLayout>
  )
}
