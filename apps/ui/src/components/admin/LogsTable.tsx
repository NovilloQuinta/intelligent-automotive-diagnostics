import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AdminLogsFilter, Paginated, AdminLog } from "@/components/admin/types";
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

const LEVEL_VARIANT: Record<string, "destructive" | "secondary" | "default" | "outline"> = {
  error: "destructive",
  warn: "outline",
  info: "default",
  debug: "outline",
};

const LEVEL_OPTIONS = [
  { value: "debug", label: "Debug" },
  { value: "info", label: "Info" },
  { value: "warn", label: "Warn" },
  { value: "error", label: "Error" },
];

const PAGE_SIZE = 20;

function truncate(text: string, maxLen = 80): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-ES");
}

export function LogsTable() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [q, setQ] = useState("");
  const [level, setLevel] = useState<string | undefined>(undefined);
  const [from, setFrom] = useState<string | undefined>(undefined);
  const [to, setTo] = useState<string | undefined>(undefined);

  const filters: AdminLogsFilter = { page, pageSize, q: q || undefined, level: level as AdminLogsFilter["level"], from, to };

  const { data, isLoading, isError, error } = useQuery<Paginated<AdminLog>>({
    queryKey: ["admin", "logs", filters],
    queryFn: () => api.admin.logs(filters),
  });

  const total = data?.total ?? 0;
  const items = data?.items ?? [];

  return (
    <div className="space-y-4">
      <DataTableFilters
        searchPlaceholder="Buscar en mensajes..."
        onSearchChange={setQ}
        onDateRangeChange={(range) => {
          setFrom(range.from);
          setTo(range.to);
          setPage(1);
        }}
        dateRange={{ from, to }}
        dateShortcuts={["today", "7d", "30d"]}
        levelFilter={{
          value: level,
          onChange: (v) => {
            setLevel(v);
            setPage(1);
          },
          options: LEVEL_OPTIONS,
        }}
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
          Error al cargar logs: {(error as Error)?.message ?? "Desconocido"}
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[100px]">Nivel</TableHead>
            <TableHead>Mensaje</TableHead>
            <TableHead className="w-[200px]">Contexto</TableHead>
            <TableHead className="w-[180px]">Fecha</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell>
                  <Skeleton className="h-5 w-16 animate-pulse" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-5 w-full animate-pulse" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-5 w-32 animate-pulse" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-5 w-36 animate-pulse" />
                </TableCell>
              </TableRow>
            ))
          ) : items.length === 0 && !isError ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                Sin resultados
              </TableCell>
            </TableRow>
          ) : (
            items.map((log) => (
              <TableRow key={log.id}>
                <TableCell>
                  <Badge variant={LEVEL_VARIANT[log.level] ?? "outline"}>
                    {log.level}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium">{log.message}</TableCell>
                <TableCell className="text-xs text-muted-foreground font-mono">
                  {log.context ? truncate(log.context) : "—"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDate(log.createdAt)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
