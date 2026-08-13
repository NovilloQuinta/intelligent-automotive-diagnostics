import { Link } from '@tanstack/react-router'
import { Gauge } from 'lucide-react'

interface HeaderProps {
  /** Muestra los botones "Iniciar sesión"/"Registrarse". Ocultos para páginas autenticadas. */
  readonly showAuthActions?: boolean
}

/** Cabecera compartida con logo + nombre y, opcionalmente, acciones de autenticación. */
export function Header({ showAuthActions = true }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link to="/" className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded border border-border bg-foreground/5">
            <Gauge className="size-4 text-primary" />
          </span>
          <span className="text-sm font-bold tracking-tight text-foreground sm:text-base">
            IADiagnostics
          </span>
        </Link>
        {showAuthActions ? (
          <nav className="flex items-center gap-2" aria-label="Acceso">
            <Link
              to="/login"
              className="rounded border border-white/15 px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-primary sm:text-sm"
            >
              Iniciar sesión
            </Link>
            <Link
              to="/login"
              className="rounded bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition hover:brightness-110 sm:text-sm"
              style={{ boxShadow: '0 6px 20px -6px rgba(255,107,53,0.6)' }}
            >
              Registrarse
            </Link>
          </nav>
        ) : null}
      </div>
    </header>
  )
}
