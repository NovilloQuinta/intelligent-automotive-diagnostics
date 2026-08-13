import { createFileRoute, Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { SessionReportPanel } from '@/components/dashboard/SessionReportPanel'
import { useDiagnosisHistoryDetail } from '@/components/history/useDiagnosisHistoryDetail'
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

export const Route = createFileRoute('/history/$sessionId')({
  component: HistoryDetailRoute,
})

function HistoryDetailRoute() {
  const { sessionId } = Route.useParams()
  const id = Number(sessionId)
  const { session, reportState, isLoading, isError, error } = useDiagnosisHistoryDetail(
    Number.isNaN(id) ? 0 : id,
  )

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

  if (!reportState) {
    return (
      <PageShell>
        <BackLink />
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Los datos del informe no están disponibles o están dañados.
        </div>
      </PageShell>
    )
  }

  const vehicleInfo = vehicleInfoFromSnapshot(session.resultJson)

  return (
    <PageShell>
      <BackLink />
      <SessionReportPanel
        snapshot={reportState}
        vehicleInfo={vehicleInfo}
        generatedAt={session.startedAt}
      />
    </PageShell>
  )
}

function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header showAuthActions={false} />
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
