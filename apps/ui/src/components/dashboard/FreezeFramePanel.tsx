import { Snowflake } from 'lucide-react'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { useFreezeFrame } from './useFreezeFrame'
import { useAvailablePids } from './useAvailablePids'
import { buildPidLabelMap, type PidLabel } from './pidCatalog'
import { PanelState } from './PanelState'

type Props = {
  scenarioId: string
  /** DTC the user selected, or null before any selection. */
  dtc: string | null
}

const EMPTY_PID_LABELS: ReadonlyMap<string, PidLabel> = new Map()

/** Tabla del freeze frame de un DTC: valores de PID en el instante del fallo, con fallback a hex si falta el catalogo. */
export function FrameTable({
  pidValues,
  pidInfo = EMPTY_PID_LABELS,
}: {
  pidValues: Record<string, number>
  /** Mapa short-PID → {name, unit}. Sin él se degrada a hex crudo + valor. */
  pidInfo?: ReadonlyMap<string, PidLabel>
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-white/5 hover:bg-transparent">
          <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">
            PID
          </TableHead>
          <TableHead className="text-right text-[10px] uppercase tracking-wider text-muted-foreground">
            Valor
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Object.entries(pidValues).map(([pid, value], i) => {
          const info = pidInfo.get(pid)
          return (
            <TableRow
              key={pid}
              className="fade-up border-white/5 hover:bg-white/[0.02]"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <TableCell className="mono text-xs font-bold text-foreground/90">
                {info?.name ?? pid}
              </TableCell>
              <TableCell className="mono text-right text-sm text-foreground/90">
                {info ? (info.unit ? `${value} ${info.unit}` : `${value}`) : `${value}`}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

/** Panel showing the OBD-II freeze frame snapshot for the selected DTC. */
export function FreezeFramePanel({ scenarioId, dtc }: Props) {
  const { loading, frame, error } = useFreezeFrame(scenarioId, dtc)
  const availablePids = useAvailablePids()
  const pidInfo = buildPidLabelMap(availablePids)

  return (
    <div className="panel flex min-h-0 flex-col p-4">
      <div className="mb-3 flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex items-center gap-2">
          <Snowflake className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold uppercase tracking-[0.15em]">Freeze Frame</h3>
        </div>
        <span className="mono text-[10px] text-muted-foreground">{dtc ?? '—'}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {!dtc && (
          <PanelState state="empty" message="Selecciona un código DTC para ver su freeze frame" />
        )}
        {dtc && loading && <PanelState state="loading" message="Cargando freeze frame…" />}
        {dtc && !loading && error && <PanelState state="error" message={error} />}
        {dtc && !loading && !error && !frame && (
          <PanelState state="empty" message="Sin freeze frame para este código" />
        )}
        {dtc && !loading && !error && frame && (
          <FrameTable pidValues={frame.pidValues} pidInfo={pidInfo} />
        )}
      </div>
    </div>
  )
}
