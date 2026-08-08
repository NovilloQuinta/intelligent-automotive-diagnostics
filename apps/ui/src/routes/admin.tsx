import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";

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
 * - **admin** (`isAdmin === true`): renders children via `<Outlet />`.
 */
function AdminLayout() {
  const auth = useAuth();

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

  // Admin access granted → render nested routes
  return <Outlet />;
}
