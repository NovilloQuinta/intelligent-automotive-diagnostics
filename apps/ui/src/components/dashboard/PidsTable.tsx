import { useEffect } from 'react'
import { AlertTriangle, Gauge, Loader2 } from 'lucide-react'
import { AiOriginBadge } from './AiOriginBadge'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import type { DiagnosisResponse, AvailablePid, PidReading } from './types'
import {
  buildPidRows,
  buildSelectablePidRows,
  mergePidRows,
  pidStatusMeta,
  togglePid,
  pruneOrphanPids,
  DEFAULT_LIVE_PIDS,
  MAX_SELECTABLE_PIDS,
  isMode01PidCode,
  shortPidCode,
  type PidRow,
} from './pidCatalog'
import type { CognitiveDiagnosisError } from './useCognitiveDiagnosis'

type Props = {
  parsedValues: DiagnosisResponse['parsedValues'] | null
  /** True when there is nothing to show yet (no diagnosis, no catalog). */
  empty: boolean
  /** PIDs discovered by the cognitive diagnosis, or null while unavailable. */
  aiRows?: PidRow[] | null
  /** True while the cognitive response (up to 60 s) is still in flight. */
  aiLoading?: boolean
  /** Set when the last cognitive search failed — shown only when there are no AI rows to display instead. */
  aiError?: CognitiveDiagnosisError | null
  /** When true, Mode 01 rows render a selection checkbox for live-telemetry gauges. */
  selectable?: boolean
  /** Controlled selection of short PID codes (no mode prefix). Defaults to {@link DEFAULT_LIVE_PIDS}. */
  selectedPids?: readonly string[]
  /** Emits the full selected short-code list whenever the selection changes. */
  onPidsChange?: (pids: readonly string[]) => void
  /** Mode 01 catalog from `GET /api/available-pids`; when present the table lists all of them. */
  availablePids?: readonly AvailablePid[] | null
  /** Live per-PID readings used to fill the value of non-fixed catalog PIDs. */
  readings?: readonly PidReading[] | null
}

/** Selection state shared by every selectable row in the table. */
interface PidSelection {
  readonly selectable: boolean
  readonly selectedPids: readonly string[]
  readonly onPidsChange?: (pids: readonly string[]) => void
}

/** Discreet badge marking a row as discovered by the AI rather than read by the fixed diagnosis. */

/** Secondary, non-blocking loading row shown while the cognitive diagnosis resolves. */
function AiLoadingRow({ colSpan }: { colSpan: number }) {
  return (
    <TableRow className="border-white/5 hover:bg-transparent">
      <TableCell colSpan={colSpan} className="text-xs italic text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin" />
          Buscando PIDs adicionales…
        </span>
      </TableCell>
    </TableRow>
  )
}

/** Brief, non-blocking notice shown when the cognitive PID search failed and left no AI rows. */
function AiErrorRow({ message, colSpan }: { message: string; colSpan: number }) {
  return (
    <TableRow className="border-white/5 hover:bg-transparent">
      <TableCell colSpan={colSpan} className="text-xs italic text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <AlertTriangle className="h-3 w-3 text-destructive" />
          No se pudieron buscar PIDs adicionales: {message}
        </span>
      </TableCell>
    </TableRow>
  )
}

function EmptyPrompt() {
  return (
    <div className="flex h-full min-h-[120px] items-center justify-center px-4 text-center text-sm text-muted-foreground">
      <span>Selecciona un vehículo y pulsa INICIAR DIAGNÓSTICO</span>
    </div>
  )
}

interface PidCheckboxProps {
  readonly short: string
  readonly checked: boolean
  readonly disabled: boolean
  readonly onChange: () => void
}

/** Selection checkbox for a Mode 01 row, disabled with a tooltip once the limit is reached. */
function PidCheckbox({ short, checked, disabled, onChange }: PidCheckboxProps) {
  return (
    <span
      title={disabled ? `Máximo ${MAX_SELECTABLE_PIDS} PIDs` : undefined}
      className={disabled ? 'cursor-not-allowed opacity-40' : undefined}
    >
      <input
        type="checkbox"
        className="h-4 w-4 accent-primary"
        checked={checked}
        disabled={disabled}
        aria-label={`Seleccionar PID ${short}`}
        onChange={onChange}
      />
    </span>
  )
}

interface PidRowViewProps {
  readonly row: PidRow
  readonly index: number
  readonly selection: PidSelection
}

/** Renders one PID table row (code, description, value, status) with an optional selection checkbox. */
function PidRowView({ row, index, selection }: PidRowViewProps) {
  const meta = pidStatusMeta(row.status)
  const selectableRow = selection.selectable && isMode01PidCode(row.code)
  const short = shortPidCode(row.code)
  const isSelected = selection.selectedPids.includes(short)
  const atLimit = selection.selectedPids.length >= MAX_SELECTABLE_PIDS
  const limitReached = selectableRow && atLimit && !isSelected

  const handleToggle = () => {
    if (selection.onPidsChange) {
      selection.onPidsChange(togglePid(selection.selectedPids, short))
    }
  }

  return (
    <TableRow
      data-testid="pid-row"
      data-code={row.code}
      className="fade-up border-white/5 hover:bg-white/[0.02]"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {selection.selectable ? (
        <TableCell>
          {selectableRow ? (
            <PidCheckbox
              short={short}
              checked={isSelected}
              disabled={limitReached}
              onChange={handleToggle}
            />
          ) : null}
        </TableCell>
      ) : null}
      <TableCell className="mono text-xs font-bold text-foreground/90">
        {row.code}
        {row.source === 'ai' ? (
          <AiOriginBadge title="PID descubierto por el diagnóstico cognitivo" />
        ) : null}
      </TableCell>
      <TableCell className="text-sm text-foreground/90">{row.description}</TableCell>
      <TableCell className="mono text-sm text-foreground/90">{row.value}</TableCell>
      <TableCell className="text-right">
        {meta ? (
          <span
            className="mono inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
            style={{
              color: meta.color,
              borderColor: meta.border,
              background: meta.bg,
            }}
          >
            <meta.icon className="h-3 w-3" style={{ color: meta.color }} />
            {meta.label}
          </span>
        ) : (
          <span className="mono text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
    </TableRow>
  )
}

interface PidRowsTableProps {
  readonly rows: PidRow[]
  readonly aiLoading: boolean
  readonly aiError: CognitiveDiagnosisError | null
  readonly selection: PidSelection
}

function PidRowsTable({ rows, aiLoading, aiError, selection }: PidRowsTableProps) {
  const hasAiRows = rows.some((row) => row.source === 'ai')
  const columnCount = selection.selectable ? 5 : 4
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-white/5 hover:bg-transparent">
          {selection.selectable ? <TableHead className="w-8" /> : null}
          <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Código
          </TableHead>
          <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Descripción
          </TableHead>
          <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Valor
          </TableHead>
          <TableHead className="text-right text-[10px] uppercase tracking-wider text-muted-foreground">
            Estado
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, index) => (
          <PidRowView key={row.code} row={row} index={index} selection={selection} />
        ))}
        {aiLoading ? <AiLoadingRow colSpan={columnCount} /> : null}
        {!aiLoading && !hasAiRows && aiError ? (
          <AiErrorRow message={aiError.message} colSpan={columnCount} />
        ) : null}
      </TableBody>
    </Table>
  )
}

/** Panel listing the selectable Mode 01 PIDs (catalog + diagnosis readings) with a selection checkbox. */
export function PidsTable({
  parsedValues,
  empty,
  aiRows = null,
  aiLoading = false,
  aiError = null,
  selectable = false,
  selectedPids = DEFAULT_LIVE_PIDS,
  onPidsChange,
  availablePids = null,
  readings = null,
}: Props) {
  const hasCatalog = availablePids !== null && availablePids.length > 0
  const baseRows = hasCatalog
    ? buildSelectablePidRows(availablePids, parsedValues, readings)
    : parsedValues
      ? buildPidRows(parsedValues)
      : null
  const rows = baseRows ? mergePidRows(baseRows, aiRows) : null

  const visibleShortCodes = (rows ?? [])
    .filter((row) => isMode01PidCode(row.code))
    .map((row) => shortPidCode(row.code))
  const activePids = rows ? pruneOrphanPids(selectedPids, visibleShortCodes) : selectedPids

  useEffect(() => {
    if (!onPidsChange || !rows) return
    if (activePids.length !== selectedPids.length) {
      onPidsChange(activePids)
    }
  }, [onPidsChange, rows, activePids, selectedPids])

  const selection: PidSelection = { selectable, selectedPids: activePids, onPidsChange }

  return (
    <div className="panel flex min-h-0 flex-col p-4">
      <div className="mb-3 flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold uppercase tracking-[0.15em]">PIDs Leídos</h3>
        </div>
        <span className="mono text-[10px] text-muted-foreground">
          {rows ? `${rows.length} registrados` : '—'}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {rows ? (
          <PidRowsTable rows={rows} aiLoading={aiLoading} aiError={aiError} selection={selection} />
        ) : empty ? (
          <EmptyPrompt />
        ) : null}
      </div>
    </div>
  )
}
