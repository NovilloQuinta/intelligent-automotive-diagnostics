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
import { PanelState } from './PanelState'

type Props = {
  scenarioId: string
  /** DTC the user selected, or null before any selection. */
  dtc: string | null
}

export function FrameTable({ pidValues }: { pidValues: Record<string, number> }) {
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
        {Object.entries(pidValues).map(([pid, value], i) => (
          <TableRow
            key={pid}
            className="fade-up border-white/5 hover:bg-white/[0.02]"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <TableCell className="mono text-xs font-bold text-foreground/90">{pid}</TableCell>
            <TableCell className="mono text-right text-sm text-foreground/90">{value}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

/** Panel showing the OBD-II freeze frame snapshot for the selected DTC. */
export function FreezeFramePanel({ scenarioId, dtc }: Props) {
  const { loading, frame, error } = useFreezeFrame(scenarioId, dtc)

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
        {dtc && !loading && !error && frame && <FrameTable pidValues={frame.pidValues} />}
      </div>
    </div>
  )
}
