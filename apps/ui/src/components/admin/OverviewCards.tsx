import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function OverviewCards() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: () => api.admin.overview(),
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-4 w-24 animate-pulse" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16 animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-md border border-destructive p-4 text-destructive">
        Error al cargar resumen: {(error as Error)?.message ?? "Desconocido"}
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const totalUsers = Object.values(data.userStats.byUserType).reduce(
    (sum, count) => sum + count,
    0,
  );

  const requestsEntries = Object.entries(data.httpRequestsByPathApprox);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Usuarios totales
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{totalUsers}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Usuarios por tipo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1 text-sm">
            <p>
              Individual:{" "}
              <span className="font-bold">
                {data.userStats.byUserType.individual ?? 0}
              </span>
            </p>
            <p>
              Workshop:{" "}
              <span className="font-bold">
                {data.userStats.byUserType.workshop ?? 0}
              </span>
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Usuarios por rol
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1 text-sm">
            <p>
              User:{" "}
              <span className="font-bold">
                {data.userStats.byRole.user ?? 0}
              </span>
            </p>
            <p>
              Admin:{" "}
              <span className="font-bold">
                {data.userStats.byRole.admin ?? 0}
              </span>
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Errores (24h)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{data.recentErrorCount}</p>
        </CardContent>
      </Card>

      {/* HTTP requests — approximation, NOT "diagnósticos" */}
      <Card className="sm:col-span-2 lg:col-span-4">
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Peticiones HTTP (aproximación)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {requestsEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin datos</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {requestsEntries.map(([path, count]) => (
                <div
                  key={path}
                  className="flex items-center justify-between rounded-md border px-3 py-2"
                >
                  <code className="text-xs">{path}</code>
                  <span className="font-bold text-sm">{count}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
