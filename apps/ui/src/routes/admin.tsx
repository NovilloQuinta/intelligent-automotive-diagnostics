import { createFileRoute, Link, Navigate, Outlet, useRouter } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { FileText, LayoutDashboard, ScrollText, Shield, Users } from "lucide-react";

const NAV_ITEMS = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard },
  { to: "/admin/logs", label: "Logs", icon: ScrollText },
  { to: "/admin/audit", label: "Auditoría", icon: FileText },
  { to: "/admin/users", label: "Usuarios", icon: Users },
  { to: "/admin/knowledge", label: "Knowledge", icon: Shield },
] as const;

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

/**
 * Layout guard for /admin/* routes.
 *
 * - **loading**: renders a centered spinner until the auth check completes.
 * - **anonymous** (or missing user): redirects to `/login`.
 * - **non-admin** (`isAdmin === false`): shows a 403 "Acceso denegado"
 *   message without redirecting.
 * - **admin** (`isAdmin === true`): renders sidebar + children via `<Outlet />`.
 */
function AdminLayout() {
  const auth = useAuth();
  const router = useRouter();

  // Auth still resolving from localStorage → show spinner
  if (auth.status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0d1117]">
        <p className="text-muted-foreground">Cargando…</p>
      </div>
    );
  }

  // Not authenticated → redirect to login
  if (auth.status === "anonymous" || !auth.user) {
    return <Navigate to="/login" />;
  }

  // Authenticated but not an admin → 403
  if (!auth.user.isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0d1117] px-4">
        <div className="max-w-md text-center">
          <h1 className="text-7xl font-bold text-foreground">403</h1>
          <h2 className="mt-4 text-xl font-semibold text-foreground">
            Acceso denegado
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            No tienes permisos para acceder al panel de administración.
          </p>
        </div>
      </div>
    );
  }

  const currentPath = router.state.location.pathname;

  // Admin access granted → sidebar + nested routes
  return (
    <div className="flex min-h-screen bg-[#0d1117]">
      <aside className="w-56 border-r border-white/5 bg-black/40 p-4">
        <div className="mb-6 flex items-center gap-2 px-2">
          <Shield className="h-5 w-5 text-primary" />
          <span className="text-sm font-bold">Admin Panel</span>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = currentPath === item.to || (item.to !== "/admin" && currentPath.startsWith(item.to));
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition ${
                  active
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
