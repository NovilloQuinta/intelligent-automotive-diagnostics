import { DtcPanel } from './DtcPanel'
import { FreezeFramePanel } from './FreezeFramePanel'
import type { DiagnosisResponse, Severity } from './types'

interface Props {
  readonly codes: DiagnosisResponse['dtcCodes'] | null
  readonly severity: Severity | null
  readonly empty: boolean
  readonly selectedCode: string | null
  readonly onSelect: (code: string) => void
  readonly scenarioId: string
  readonly onDiagnose?: () => void
}

/**
 * Une los codigos DTC y su freeze frame bajo una sola entrada del menu: antes
 * vivian en dos pantallas distintas y elegir un codigo en una no se reflejaba
 * en la otra sin cambiar de seccion.
 */
export function DtcOverviewPanel({
  codes,
  severity,
  empty,
  selectedCode,
  onSelect,
  scenarioId,
  onDiagnose,
}: Props) {
  return (
    <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-2">
      <DtcPanel
        codes={codes}
        severity={severity}
        empty={empty}
        selectedCode={selectedCode}
        onSelect={onSelect}
        scenarioId={scenarioId}
        onDiagnose={onDiagnose}
      />
      <FreezeFramePanel scenarioId={scenarioId} dtc={selectedCode} />
    </div>
  )
}
