import { useCallback, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Calendar, FileText } from 'lucide-react'
import { useDiagnosisHistory } from './useDiagnosisHistory'
import { severityMeta } from '@/components/dashboard/severityMeta'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { computeDateRange, DATE_SHORTCUT_LABELS } from '@/lib/date'
import type { DateShortcut } from '@/lib/date'
import { Paginator } from '@/components/shared/Paginator'
import type { Severity } from '@/components/dashboard/types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_LIMIT = 25

const SEVERITY_OPTIONS: { value: string; label: string }[] = [
  { value: 'low', label: 'Baja' },
  { value: 'medium', label: 'Media' },
  { value: 'high', label: 'Alta' },
  { value: 'critical', label: 'Crítica' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function hasActiveFilters(from: string, to: string, severity: string): boolean {
  return from !== '' || to !== '' || severity !== 'all'
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HistoryPage() {
  // Filter state
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [severity, setSeverity] = useState('all')
  const [page, setPage] = useState(1)

  const offset = (page - 1) * DEFAULT_LIMIT

  const filters = useMemo(
    () => ({
      from: from || undefined,
      to: to || undefined,
      severity: severity !== 'all' ? severity : undefined,
      limit: DEFAULT_LIMIT,
      offset,
    }),
    [from, to, severity, offset],
  )

  const { sessions, total, isLoading, isError, error } = useDiagnosisHistory(filters)

  const totalPages = Math.max(1, Math.ceil(total / DEFAULT_LIMIT))
  const filtersActive = hasActiveFilters(from, to, severity)

  const handleShortcut = useCallback((shortcut: DateShortcut) => {
    const range = computeDateRange(shortcut)
    setFrom(range.from)
    setTo(range.to)
    setPage(1)
  }, [])

  const handleSeverityChange = useCallback((value: string) => {
    setSeverity(value)
    setPage(1)
  }, [])

  // -----------------------------------------------------------------------
  // Rendering
  // -----------------------------------------------------------------------

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Calendar className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">Historial de Diagnósticos</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-white/10 bg-black/20 p-4">
        {/* From date */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="from-date">Desde</Label>
          <Input
            id="from-date"
            type="date"
            value={from ? from.slice(0, 10) : ''}
            onChange={(e) => {
              const val = e.target.value
              setFrom(val ? new Date(val).toISOString() : '')
              setPage(1)
            }}
            className="w-[160px]"
          />
        </div>

        {/* To date */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="to-date">Hasta</Label>
          <Input
            id="to-date"
            type="date"
            value={to ? to.slice(0, 10) : ''}
            onChange={(e) => {
              const val = e.target.value
              setTo(val ? new Date(val).toISOString() : '')
              setPage(1)
            }}
            className="w-[160px]"
          />
        </div>

        {/* Shortcuts */}
        <div className="flex items-end gap-1">
          {(['today', '7d', '30d'] as DateShortcut[]).map((s) => (
            <Button key={s} variant="outline" size="sm" onClick={() => handleShortcut(s)}>
              {DATE_SHORTCUT_LABELS[s]}
            </Button>
          ))}
        </div>

        {/* Severity filter */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="severity-filter">Severidad</Label>
          <Select value={severity} onValueChange={handleSeverityChange}>
            <SelectTrigger id="severity-filter" className="w-[140px]" aria-label="Severidad">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {SEVERITY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Error */}
      {isError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Error al cargar el historial: {error?.message ?? 'Desconocido'}
        </div>
      )}

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow className="border-white/5 hover:bg-transparent">
            <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">
              Fecha
            </TableHead>
            <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">
              Vehículo
            </TableHead>
            <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">
              Nº DTCs
            </TableHead>
            <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">
              Severidad
            </TableHead>
            <TableHead className="w-[50px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i} className="border-white/5">
                <TableCell>
                  <Skeleton className="h-5 w-36" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-5 w-28" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-5 w-16" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-5 w-20" />
                </TableCell>
                <TableCell />
              </TableRow>
            ))
          ) : sessions.length === 0 ? (
            <TableRow className="border-white/5">
              <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                {filtersActive
                  ? 'Sin resultados para los filtros seleccionados'
                  : 'Sin diagnósticos guardados. Realiza un diagnóstico para verlo aquí.'}
              </TableCell>
            </TableRow>
          ) : (
            sessions.map((session) => {
              const sev = severityMeta((session.severity as Severity) ?? 'low')
              return (
                <TableRow key={session.id} className="border-white/5 hover:bg-white/[0.02]">
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(session.startedAt)}
                  </TableCell>
                  <TableCell className="font-medium text-foreground/90">
                    {session.vehicleMake} {session.vehicleModel}
                  </TableCell>
                  <TableCell className="text-sm">{session.dtcCount}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className="text-[10px] font-bold uppercase tracking-wider"
                      style={{
                        color: sev.color,
                        borderColor: sev.border,
                        background: sev.bg,
                      }}
                    >
                      {sev.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Link
                      to="/history/$sessionId"
                      params={{ sessionId: String(session.id) }}
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Ver
                    </Link>
                  </TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>

      {/* Pagination — only shown when total > limit */}
      {total > DEFAULT_LIMIT ? (
        <Paginator page={page} totalPages={totalPages} total={total} onPageChange={setPage} />
      ) : null}
    </div>
  )
}
