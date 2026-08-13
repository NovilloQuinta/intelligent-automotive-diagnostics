import { Link } from '@tanstack/react-router'
import { Gauge, History, LogOut, User } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'

interface HeaderProps {
  /** Muestra las acciones de acceso (Iniciar sesión/Registrarse) a visitantes anónimos. */
  readonly showAuthActions?: boolean
}

/** Cabecera compartida: logo + navegación (autenticado) o acciones de acceso (anónimo). */
export function Header({ showAuthActions = true }: HeaderProps) {
  const auth = useAuth()

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
        {auth.status === 'authed' ? (
          <AuthedNav onLogout={auth.logout} />
        ) : showAuthActions ? (
          <AuthActions />
        ) : null}
      </div>
    </header>
  )
}

function AuthActions() {
  return (
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
  )
}

function AuthedNav({ onLogout }: { onLogout: () => void }) {
  return (
    <nav className="flex items-center gap-2" aria-label="Navegación">
      <Link
        to="/"
        className="flex items-center gap-1.5 rounded border border-white/15 px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-primary sm:text-sm"
      >
        <Gauge className="size-3.5" />
        Inicio
      </Link>
      <Link
        to="/history"
        className="flex items-center gap-1.5 rounded border border-white/15 px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-primary sm:text-sm"
      >
        <History className="size-3.5" />
        Historial
      </Link>
      <Link
        to="/profile"
        className="flex items-center gap-1.5 rounded border border-white/15 px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-primary sm:text-sm"
      >
        <User className="size-3.5" />
        Perfil
      </Link>
      <button
        type="button"
        onClick={onLogout}
        className="flex items-center gap-1.5 rounded border border-white/15 px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-destructive sm:text-sm"
      >
        <LogOut className="size-3.5" />
        Cerrar sesión
      </button>
    </nav>
  )
}
