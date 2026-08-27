import { createFileRoute, Link, Navigate, Outlet, useLocation } from '@tanstack/react-router'
import { useAuth } from '@/lib/auth-context'
import { FileText, Home, LayoutDashboard, ScrollText, Shield, Users } from 'lucide-react'

/**
 * `exact` va en TODOS los items a proposito: con `as const`, un array donde solo
 * algunos elementos declaran la propiedad produce una union en la que `exact` no
 * existe, y `item.exact` no compila. Se mantiene `as const` porque `Link to`
 * exige los literales de ruta.
 */
const NAV_ITEMS = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true },
  { to: '/admin/logs', label: 'Logs', icon: ScrollText, exact: false },
  { to: '/admin/audit', label: 'Auditoría', icon: FileText, exact: false },
  { to: '/admin/users', label: 'Usuarios', icon: Users, exact: false },
  { to: '/admin/knowledge', label: 'Knowledge', icon: Shield, exact: false },
] as const

export const Route = createFileRoute('/admin')({
  component: AdminLayout,
})

function AdminLayout() {
  const auth = useAuth()
  const location = useLocation()

  if (auth.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0d1117]">
        <p className="text-muted-foreground">Cargando…</p>
      </div>
    )
  }

  if (auth.status === 'anonymous' || !auth.user) {
    return <Navigate to="/login" />
  }

  if (!auth.user.isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0d1117] px-4">
        <div className="max-w-md text-center">
          <h1 className="text-7xl font-bold text-foreground">403</h1>
          <h2 className="mt-4 text-xl font-semibold text-foreground">Acceso denegado</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            No tienes permisos para acceder al panel de administración.
          </p>
        </div>
      </div>
    )
  }

  // El backend responde 403 al panel si el administrador no tiene segundo factor.
  // Sin este aviso, el admin veria un error generico y no sabria que hacer: la
  // pantalla para activarlo esta en su perfil, y esa si le sigue abierta.
  if (!auth.user.twoFactorEnabled) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0d1117] px-4">
        <div className="max-w-md text-center">
          <Shield className="mx-auto h-12 w-12 text-primary" />
          <h2 className="mt-4 text-xl font-semibold text-foreground">
            Activa el segundo factor para entrar
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            El panel de administración expone los usuarios, los registros y la auditoría. Una sola
            contraseña no basta para llegar ahí.
          </p>
          <Link
            to="/profile"
            className="mt-6 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Ir a mi perfil
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-[#0d1117]">
      <aside className="flex w-56 flex-col border-r border-white/5 bg-black/40 p-4">
        <div className="mb-6 flex items-center gap-2 px-2">
          <Shield className="h-5 w-5 text-primary" />
          <span className="text-sm font-bold">Admin Panel</span>
        </div>
        <nav aria-label="Navegación del panel" className="flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const active = item.exact
              ? location.pathname === item.to
              : location.pathname.startsWith(item.to)
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition ${
                  active
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>
        <Link
          to="/"
          className="mt-auto flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
        >
          <Home className="h-4 w-4" />
          Volver al diagnóstico
        </Link>
      </aside>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
