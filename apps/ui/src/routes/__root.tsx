import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Outlet, Link, createRootRouteWithContext, useRouter } from '@tanstack/react-router'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/lib/auth-context'

import appCss from '../styles.css?url'

/** Shared primary action styling for error and not-found states. */
const ACTION_BUTTON_CLASSES =
  'inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90'

/** Centered full-screen container shared by error and not-found states. */
function CenteredLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">{children}</div>
    </div>
  )
}

/** Primary action button shared by error and not-found states. */
function ActionButton({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={ACTION_BUTTON_CLASSES} {...props}>
      {children}
    </button>
  )
}

function NotFoundComponent() {
  return (
    <CenteredLayout>
      <h1 className="text-7xl font-bold text-foreground">404</h1>
      <h2 className="mt-4 text-xl font-semibold text-foreground">Página no encontrada</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        La página que buscas no existe o ha sido movida.
      </p>
      <div className="mt-6">
        <Link to="/" className={ACTION_BUTTON_CLASSES}>
          Ir al inicio
        </Link>
      </div>
    </CenteredLayout>
  )
}

function ErrorComponent({ reset }: { error: Error; reset: () => void }) {
  const router = useRouter()

  return (
    <CenteredLayout>
      <h1 className="text-xl font-semibold tracking-tight text-foreground">Esta página no cargó</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Algo salió mal. Puedes intentar recargar o volver al inicio.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <ActionButton
          onClick={() => {
            router.invalidate()
            reset()
          }}
        >
          Reintentar
        </ActionButton>
        <a
          href="/"
          className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          Ir al inicio
        </a>
      </div>
    </CenteredLayout>
  )
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Intelligent Automotive Diagnostics' },
      {
        name: 'description',
        content: 'Plataforma profesional de diagnóstico OBD-II con IA para talleres mecánicos.',
      },
      { name: 'author', content: 'Intelligent Automotive Diagnostics' },
      { property: 'og:title', content: 'Intelligent Automotive Diagnostics' },
      {
        property: 'og:description',
        content: 'Diagnóstico OBD-II asistido por IA para talleres profesionales.',
      },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap',
      },
      { rel: 'icon', href: '/favicon.ico', type: 'image/x-icon' },
    ],
  }),
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
})

function RootComponent() {
  const { queryClient } = Route.useRouteContext()

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Outlet />
        <Toaster theme="dark" position="top-right" richColors closeButton />
      </AuthProvider>
    </QueryClientProvider>
  )
}
