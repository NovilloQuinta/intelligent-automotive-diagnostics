import { createFileRoute, Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { ArrowLeft, Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SessionReportPanel } from '@/components/dashboard/SessionReportPanel'
import { useCognitiveDiagnosis } from '@/components/dashboard/useCognitiveDiagnosis'
import {
  useDiagnosisHistoryDetail,
  reportStateFromOnDemandCognitive,
} from '@/components/history/useDiagnosisHistoryDetail'
import { Header } from '@/components/layout/Header'
import { FooterSection } from '@/components/landing/FooterSection'
import type { Scenario } from '@/components/dashboard/types'

/** Extrae la identidad del vehículo del snapshot inmutable `resultJson`. */
function vehicleInfoFromSnapshot(resultJson: string | null): Scenario['vehicleInfo'] | undefined {
  if (!resultJson) return undefined
  try {
    const parsed = JSON.parse(resultJson) as { vehicle?: Scenario['vehicleInfo'] }
    return parsed.vehicle
  } catch {
    return undefined
  }
}

export const Route = createFileRoute('/history_/$sessionId')({
  component: HistoryDetailRoute,
})

function HistoryDetailRoute() {
  const { sessionId } = Route.useParams()
  const id = Number(sessionId)
  const { session, reportState, isLoading, isError, error } = useDiagnosisHistoryDetail(
    Number.isNaN(id) ? 0 : id,
  )
  const onDemand = useCognitiveDiagnosis(session?.scenarioId ?? '')

  if (Number.isNaN(id)) {
    return (
      <PageShell>
        <BackLink />
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          ID de sesión inválido
        </div>
      </PageShell>
    )
  }

  if (isLoading) {
    return (
      <PageShell>
        <BackLink />
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="ml-3 text-sm text-muted-foreground">Cargando informe…</span>
        </div>
      </PageShell>
    )
  }

  if (isError || !session) {
    return (
      <PageShell>
        <BackLink />
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Error al cargar el informe: {error?.message ?? 'Desconocido'}
        </div>
      </PageShell>
    )
  }

  const onDemandState = onDemand.diagnosisText
    ? reportStateFromOnDemandCognitive({
        diagnosisText: onDemand.diagnosisText,
        severity: onDemand.severity,
        confidence: onDemand.confidence,
        recommendations: onDemand.recommendations,
      })
    : null
  const finalReportState = reportState ?? onDemandState

  if (!finalReportState) {
    return (
      <PageShell>
        <BackLink />
        <MissingDiagnosisNotice session={session} onDemand={onDemand} />
      </PageShell>
    )
  }

  const vehicleInfo = vehicleInfoFromSnapshot(session.resultJson)

  return (
    <PageShell>
      <BackLink />
      <SessionReportPanel
        snapshot={finalReportState}
        vehicleInfo={vehicleInfo}
        generatedAt={session.startedAt}
      />
    </PageShell>
  )
}

/**
 * Sesión sin narrativa guardada (habitual en sesiones antiguas, previas al
 * cambio que persiste el diagnóstico cognitivo). Si la sesión guardó a qué
 * escenario pertenecía, se puede volver a lanzar el mismo diagnóstico que usa
 * el panel en vivo — no hace falta reabrir una conexión al vehículo, el
 * escenario ya identifica de qué coche se trata.
 */
function MissingDiagnosisNotice({
  session,
  onDemand,
}: {
  readonly session: NonNullable<ReturnType<typeof useDiagnosisHistoryDetail>['session']>
  readonly onDemand: ReturnType<typeof useCognitiveDiagnosis>
}) {
  if (!session.scenarioId) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        Los datos del informe no están disponibles o están dañados.
      </div>
    )
  }

  return (
    <div className="panel space-y-3 p-5 text-sm">
      <p className="text-muted-foreground">
        Esta sesión no guardó un diagnóstico de la IA. Puedes generarlo ahora sobre el mismo
        vehículo.
      </p>
      {onDemand.error && <p className="text-destructive">{onDemand.error.message}</p>}
      <Button onClick={() => onDemand.trigger()} disabled={onDemand.loading}>
        {onDemand.loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Generando diagnóstico…
          </>
        ) : (
          <>
            <Sparkles className="mr-2 h-4 w-4" />
            Generar diagnóstico IA
          </>
        )}
      </Button>
    </div>
  )
}

function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <div className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-8">{children}</div>
      <FooterSection />
    </div>
  )
}

function BackLink() {
  return (
    <Link
      to="/history"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      Volver al historial
    </Link>
  )
}
