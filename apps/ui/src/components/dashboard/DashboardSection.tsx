import { TelemetrySection } from './TelemetrySection'
import { PidsTable } from './PidsTable'
import { DtcPanel } from './DtcPanel'
import { FreezeFramePanel } from './FreezeFramePanel'
import { EcuInfoPanel } from './EcuInfoPanel'
import { DiagnosisPanel } from './DiagnosisPanel'
import { MechanicChat } from './MechanicChat'
import { SessionReportPanel } from './SessionReportPanel'
import { VehicleStatusPanel } from './VehicleStatusPanel'
import type { SidebarSection } from '@/components/layout/Sidebar'
import type { CognitiveDiagnosisError } from './useCognitiveDiagnosis'
import type { EcuInfo, Scenario, DiagnosisResponse } from './types'
import type { PidRow } from './pidCatalog'
import type { ConversationItem } from '@/lib/api'

// ---------------------------------------------------------------------------
// Props sub-interfaces — grouped by domain to reduce flat-prop count
// ---------------------------------------------------------------------------

export interface TelemetryConfig {
  readonly rpm: number | null
  readonly coolant: number | null
  readonly speed: number | null
  readonly intake: number | null
  readonly rawSummary: string | null
}

export interface DiagnosisState {
  readonly loading: boolean
  readonly streamOk: boolean
  readonly result: DiagnosisResponse | null | undefined
  readonly dtcCodes: readonly { code: string; description?: string }[] | null
  readonly selectedDtc: string | null
}

export interface CognitiveState {
  readonly diagnosisText: string | null
  readonly severity: string | null
  readonly confidence: number | null
  readonly conversationHistory: ConversationItem[]
  readonly loading: boolean
  readonly error: CognitiveDiagnosisError | null
  readonly pidRows: PidRow[] | null
  readonly available: boolean
}

export interface EcuState {
  readonly ecus: EcuInfo[] | null
  readonly loading: boolean
  readonly error: string | null
}

export interface DashboardSectionProps {
  readonly activeSection: SidebarSection
  readonly selectedId: string | null
  readonly selectedScenario: Scenario | null
  readonly telemetry: TelemetryConfig
  readonly diagnosis: DiagnosisState
  readonly cognitive: CognitiveState
  readonly ecu: EcuState
  readonly onDiagnose: () => void
  readonly onDtcSelect: (code: string) => void
  readonly onChatSend: (query: string) => void
}

export function DashboardSection({
  activeSection,
  selectedId,
  selectedScenario,
  telemetry,
  diagnosis,
  cognitive,
  ecu,
  onDiagnose,
  onDtcSelect,
  onChatSend,
}: DashboardSectionProps) {
  const { rpm, coolant, speed, intake, rawSummary } = telemetry
  const { loading, streamOk, result, dtcCodes, selectedDtc } = diagnosis
  const { ecus, loading: ecusLoading, error: ecusError } = ecu

  switch (activeSection) {
    case 'vehicle':
      return <VehicleStatusPanel scenarioId={selectedId ?? ''} />
    case 'live-data':
      return (
        <div className="space-y-6">
          <TelemetrySection
            values={{ rpm, coolant, speed, intake }}
            rawSummary={rawSummary}
            loading={loading}
            streamOk={streamOk}
            canDiagnose={!!selectedId}
            telemetryStatus={streamOk ? 'Transmisión ECU · 1 Hz' : 'Reconectando…'}
            onDiagnose={onDiagnose}
          />
          <PidsTable
            parsedValues={result?.parsedValues ?? null}
            empty={!result && !loading}
            aiRows={cognitive.pidRows}
            aiLoading={cognitive.loading}
            aiError={cognitive.error}
          />
        </div>
      )
    case 'dtc':
      return (
        <DtcPanel
          codes={dtcCodes as import('./types').DtcCode[] | null}
          severity={result?.severity ?? null}
          empty={!result && !loading}
          selectedCode={selectedDtc}
          onSelect={onDtcSelect}
          scenarioId={selectedId || ''}
          onDiagnose={onDiagnose}
        />
      )
    case 'freeze-frame':
      return <FreezeFramePanel scenarioId={selectedId!} dtc={selectedDtc} />
    case 'ecu':
      return (
        <EcuInfoPanel
          ecus={ecus ?? []}
          loading={ecusLoading}
          error={ecusError}
          selectedId={selectedId!}
        />
      )
    case 'diagnosis':
      return (
        <DiagnosisPanel
          text={result?.diagnosisText ?? null}
          severity={result?.severity ?? null}
          empty={!result && !loading}
          loading={loading}
        />
      )
    case 'chat':
      if (!cognitive.available) {
        return (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            El diagnóstico cognitivo no está disponible en este entorno.
          </div>
        )
      }
      return (
        <MechanicChat
          diagnosisText={cognitive.diagnosisText}
          severity={cognitive.severity}
          confidence={cognitive.confidence}
          conversationHistory={cognitive.conversationHistory}
          loading={cognitive.loading}
          error={cognitive.error}
          onSend={onChatSend}
        />
      )
    case 'report':
      return (
        <SessionReportPanel scenarioId={selectedId!} vehicleInfo={selectedScenario?.vehicleInfo} />
      )
    default:
      return null
  }
}
