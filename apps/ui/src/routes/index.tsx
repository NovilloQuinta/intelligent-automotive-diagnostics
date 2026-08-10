import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '@/lib/auth-context'
import { DashboardPage } from '@/components/dashboard/DashboardPage'
import { LandingPage } from '@/components/landing/LandingPage'

export const Route = createFileRoute('/')({
  component: HomeRoute,
})

/** Public landing page for anonymous visitors, dashboard for authenticated users. */
function HomeRoute() {
  const auth = useAuth()

  if (auth.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0d1117]">
        <p className="text-muted-foreground">Cargando…</p>
      </div>
    )
  }

  if (auth.status === 'anonymous') {
    return <LandingPage />
  }

  return <DashboardPage />
}
