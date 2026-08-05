import { Activity, Info, Loader2 } from 'lucide-react'
import type { Severity } from './types'
import { severityMeta } from './severityMeta'

type Props = {
  text: string | null
  severity: Severity | null
  empty: boolean
  loading: boolean
}

/** AI diagnosis result panel with severity badge, loading skeleton, and formatted text output. */
export function DiagnosisPanel({ text, severity, empty, loading }: Props) {
  const meta = severity ? severityMeta(severity) : null
  const Icon = meta?.icon ?? Info

  return (
    <div className="panel flex min-h-0 flex-col p-4">
      <DiagnosisHeader meta={meta} />
      <div className="min-h-0 flex-1 overflow-auto">
        {empty && !loading && <EmptyMessage />}
        {loading && <LoadingMessage />}
        {text && meta && !loading && <DiagnosisContent text={text} meta={meta} Icon={Icon} />}
      </div>
    </div>
  )
}

function DiagnosisHeader({ meta }: { meta: ReturnType<typeof severityMeta> | null }) {
  return (
    <div className="mb-3 flex items-center justify-between border-b border-white/5 pb-3">
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold uppercase tracking-[0.15em]">Diagnóstico IA</h3>
      </div>
      {meta && (
        <span className="mono inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
          style={{ color: meta.color, borderColor: meta.border, background: meta.bg }}>
          <span className="h-1.5 w-1.5 rounded-full"
            style={{ background: meta.color, boxShadow: `0 0 6px ${meta.color}` }} />
          {meta.label}
        </span>
      )}
    </div>
  )
}

function EmptyMessage() {
  return (
    <div className="flex h-full min-h-[120px] items-center justify-center px-4 text-center text-sm text-muted-foreground">
      Sin datos. Ejecuta un diagnóstico para obtener el informe.
    </div>
  )
}

function LoadingMessage() {
  return (
    <div className="flex items-center gap-3 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin text-primary" />
      Analizando datos OBD-II con IA…
    </div>
  )
}

function DiagnosisContent({ text, meta, Icon }: {
  text: string
  meta: ReturnType<typeof severityMeta>
  Icon: typeof Info
}) {
  return (
    <div className="fade-up flex gap-3 rounded-lg border p-4 text-sm leading-relaxed"
      style={{ background: meta.bg, borderColor: meta.border }}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" style={{ color: meta.color }} />
      <div className="min-w-0 flex-1 space-y-2 whitespace-pre-line text-foreground/90">{text}</div>
    </div>
  )
}
