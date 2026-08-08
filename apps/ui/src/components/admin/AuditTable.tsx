import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AdminAuditFilter, Paginated, AdminAuditLog } from "@/components/admin/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTableFilters } from "@/components/admin/DataTableFilters";

const STATUS_BADGE_CLASS: Record<string, string> = {
  "2": "border-transparent bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
  "3": "border-transparent bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100",
  "4": "border-transparent bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100",
  "5": "border-transparent bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100",
};

function statusBadgeClass(statusCode: number): string {
  const prefix = String(statusCode)[0];
  return STATUS_BADGE_CLASS[prefix] ?? "";
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  return `${ms}ms`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-ES");
}

const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { value: "200", label: "200" },
  { value: "400", label: "400" },
  { value: "401", label: "401" },
  { value: "403", label: "403" },
  { value: "404", label: "404" },
  { value: "500", label: "500" },
];

export function AuditTable() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [q, setQ] = useState("");
  const [statusCode, setStatusCode] = useState<number | undefined>(undefined);
  const [userId, setUserId] = useState<number | undefined>(undefined);
  const [from, setFrom] = useState<string | undefined>(undefined);
  const [to, setTo] = useState<string | undefined>(undefined);

  const filters: AdminAuditFilter = {
    page,
    pageSize,
    q: q || undefined,
    statusCode,
    userId,
    from,
    to,
  };

  const { data, isLoading, isError, error } = useQuery<Paginated<AdminAuditLog>>({
    queryKey: ["admin", "audit-logs", filters],
    queryFn: () => api.admin.auditLogs(filters),
  });

  const total = data?.total ?? 0;
  const items = data?.items ?? [];

  return (
    <div className="space-y-4">
      {/* Extra filters not rendered by DataTableFilters: statusCode + userId */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={statusCode !== undefined ? String(statusCode) : "all"}
          onValueChange={(v) => {
            setStatusCode(v === "all" ? undefined : Number(v));
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[120px]" aria-label="Status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="number"
          placeholder="User ID"
          className="max-w-[120px]"
          onChange={(e) => {
            const val = e.target.value;
            setUserId(val ? Number(val) : undefined);
            setPage(1);
          }}
        />
      </div>

      <DataTableFilters
        searchPlaceholder="Buscar por ruta..."
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
          Error al cargar auditoría: {(error as Error)?.message ?? "Desconocido"}
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[80px]">Método</TableHead>
            <TableHead>Ruta</TableHead>
            <TableHead className="w-[80px]">Status</TableHead>
            <TableHead className="w-[80px]">Dur.</TableHead>
            <TableHead className="w-[120px]">IP</TableHead>
            <TableHead className="w-[180px]">Fecha</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell>
                  <Skeleton className="h-5 w-12 animate-pulse" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-5 w-full animate-pulse" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-5 w-12 animate-pulse" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-5 w-12 animate-pulse" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-5 w-20 animate-pulse" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-5 w-36 animate-pulse" />
                </TableCell>
              </TableRow>
            ))
          ) : items.length === 0 && !isError ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                Sin resultados
              </TableCell>
            </TableRow>
          ) : (
            items.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="font-mono text-xs font-medium">
                  {log.method}
                </TableCell>
                <TableCell className="font-mono text-xs">{log.path}</TableCell>
                <TableCell>
                  <Badge className={statusBadgeClass(log.statusCode)}>
                    {log.statusCode}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDuration(log.durationMs)}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {log.ip ?? "—"}
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
