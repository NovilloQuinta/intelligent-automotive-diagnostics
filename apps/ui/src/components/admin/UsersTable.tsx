import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  AdminUsersFilter,
  Paginated,
  AdminUser,
} from "@/components/admin/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTableFilters } from "@/components/admin/DataTableFilters";

const PAGE_SIZE = 20;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-ES");
}

export function UsersTable() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [q, setQ] = useState("");
  const [from, setFrom] = useState<string | undefined>(undefined);
  const [to, setTo] = useState<string | undefined>(undefined);

  const filters: AdminUsersFilter = {
    page,
    pageSize,
    q: q || undefined,
    from,
    to,
  };

  const { data, isLoading, isError, error } = useQuery<Paginated<AdminUser>>({
    queryKey: ["admin", "users", filters],
    queryFn: () => api.admin.users(filters),
  });

  const total = data?.total ?? 0;
  const items = data?.items ?? [];

  return (
    <div className="space-y-4">
      <DataTableFilters
        searchPlaceholder="Buscar por email o username..."
        onSearchChange={setQ}
        onDateRangeChange={(range) => {
          setFrom(range.from);
          setTo(range.to);
          setPage(1);
        }}
        dateRange={{ from, to }}
        dateShortcuts={["today", "7d", "30d"]}
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />

      {isError && (
        <div className="rounded-md border border-destructive p-4 text-destructive">
          Error al cargar usuarios: {(error as Error)?.message ?? "Desconocido"}
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Username</TableHead>
            <TableHead className="w-[120px]">Tipo</TableHead>
            <TableHead className="w-[100px]">Rol</TableHead>
            <TableHead className="w-[180px]">Registro</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell>
                  <Skeleton className="h-5 w-48 animate-pulse" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-5 w-32 animate-pulse" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-5 w-20 animate-pulse" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-5 w-16 animate-pulse" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-5 w-36 animate-pulse" />
                </TableCell>
              </TableRow>
            ))
          ) : items.length === 0 && !isError ? (
            <TableRow>
              <TableCell
                colSpan={5}
                className="text-center text-muted-foreground"
              >
                Sin resultados
              </TableCell>
            </TableRow>
          ) : (
            items.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.email}</TableCell>
                <TableCell>{user.username}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      user.userType === "workshop" ? "secondary" : "default"
                    }
                  >
                    {user.userType}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={user.role === "admin" ? "destructive" : "outline"}
                  >
                    {user.role}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDate(user.createdAt)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
