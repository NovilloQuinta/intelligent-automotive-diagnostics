import { CheckCircle2, CircuitBoard } from 'lucide-react'
import type { DiagnosisResponse, Severity } from './types'
import { COLORS, DTC_COLORS, SVG_STROKES } from './types'
import { severityMeta } from './severityMeta'

const DEFAULT_SEVERITY: Severity = 'medium'

type Props = {
  codes: DiagnosisResponse['dtcCodes'] | null
  severity: Severity | null
  empty: boolean
}

function EmptyPrompt() {
  return (
    <div className="flex h-full min-h-[120px] items-center justify-center px-4 text-center text-sm text-muted-foreground">
      <span>Selecciona un vehículo y pulsa INICIAR DIAGNÓSTICO</span>
    </div>
  )
}

function NoCodesMessage() {
  return (
    <div
      className="fade-up flex items-center gap-3 rounded-lg border p-4 text-sm"
      style={{ background: DTC_COLORS.noCodesBg, borderColor: DTC_COLORS.noCodesBorder, color: COLORS.accentMuted }}
    >
      <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color: COLORS.accent }} />
      <span>Ningún código de error — el vehículo no presenta fallos registrados.</span>
    </div>
  )
}

function CodeList({ codes, severity }: { codes: DiagnosisResponse['dtcCodes']; severity: Severity | null }) {
  const meta = severityMeta(severity ?? DEFAULT_SEVERITY)
  return (
    <ul className="space-y-2">
      {codes.map((c, i) => (
        <li
          key={c.code}
          className="fade-up flex items-center gap-3 rounded-lg border border-white/5 bg-black/30 p-3"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <span
            className="mono inline-flex shrink-0 items-center rounded-md px-2.5 py-1 text-sm font-bold"
            style={{ background: COLORS.primary, color: COLORS.background, boxShadow: SVG_STROKES.dtcGlow }}
          >
            {c.code}
          </span>
          <span className="flex-1 text-sm text-foreground/90">{c.description}</span>
          <meta.icon className="h-4 w-4 shrink-0" style={{ color: meta.color }} />
        </li>
      ))}
    </ul>
  )
}

/** Panel displaying DTC fault codes with severity-based styling and empty/no-codes states. */
export function DtcPanel({ codes, severity, empty }: Props) {
  return (
    <div className="panel flex min-h-0 flex-col p-4">
      <div className="mb-3 flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex items-center gap-2">
          <CircuitBoard className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold uppercase tracking-[0.15em]">Códigos DTC</h3>
        </div>
        <span className="mono text-[10px] text-muted-foreground">
          {codes ? `${codes.length} registrado${codes.length === 1 ? '' : 's'}` : '—'}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {empty && <EmptyPrompt />}
        {!empty && codes && codes.length === 0 && <NoCodesMessage />}
        {!empty && codes && codes.length > 0 && <CodeList codes={codes} severity={severity} />}
      </div>
    </div>
  )
}
