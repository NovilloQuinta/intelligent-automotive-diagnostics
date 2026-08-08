import { useCallback, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

type DateShortcut = "today" | "7d" | "30d";

type LevelFilter = {
  value?: string;
  onChange: (level?: string) => void;
  options: { value: string; label: string }[];
};

type StatusFilter = {
  value?: number;
  onChange: (statusCode?: number) => void;
};

type DataTableFiltersProps = {
  searchPlaceholder?: string;
  onSearchChange: (q: string) => void;
  onDateRangeChange: (range: { from?: string; to?: string }) => void;
  dateRange?: { from?: string; to?: string };
  dateShortcuts?: DateShortcut[];
  levelFilter?: LevelFilter;
  statusFilter?: StatusFilter;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

const DATE_SHORTCUT_LABELS: Record<DateShortcut, string> = {
  today: "Hoy",
  "7d": "7 d",
  "30d": "30 d",
};

function computeDateRange(shortcut: DateShortcut): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString();
  const from = new Date(now);

  switch (shortcut) {
    case "today":
      from.setHours(0, 0, 0, 0);
      break;
    case "7d":
      from.setDate(from.getDate() - 7);
      from.setHours(0, 0, 0, 0);
      break;
    case "30d":
      from.setDate(from.getDate() - 30);
      from.setHours(0, 0, 0, 0);
      break;
  }

  return { from: from.toISOString(), to };
}

export function DataTableFilters(props: DataTableFiltersProps) {
  const {
    searchPlaceholder = "Buscar...",
    onSearchChange,
    onDateRangeChange,
    dateShortcuts,
    levelFilter,
    page,
    pageSize,
    total,
    onPageChange,
    onPageSizeChange,
  } = props;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const handleShortcut = useCallback(
    (shortcut: DateShortcut) => {
      onDateRangeChange(computeDateRange(shortcut));
    },
    [onDateRangeChange],
  );

  const pageNumbers = useMemo(() => {
    const pages: number[] = [];
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i);
    }
    return pages;
  }, [totalPages]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder={searchPlaceholder}
          className="max-w-xs"
          onChange={(e) => onSearchChange(e.target.value)}
        />

        {dateShortcuts && dateShortcuts.length > 0 && (
          <div className="flex items-center gap-1">
            {dateShortcuts.map((shortcut) => (
              <Button
                key={shortcut}
                variant="outline"
                size="sm"
                onClick={() => handleShortcut(shortcut)}
              >
                {DATE_SHORTCUT_LABELS[shortcut]}
              </Button>
            ))}
          </div>
        )}

        {levelFilter && (
          <Select
            value={levelFilter.value ?? "all"}
            onValueChange={(v) =>
              levelFilter.onChange(v === "all" ? undefined : v)
            }
          >
            <SelectTrigger className="w-[130px]" aria-label="Nivel">
              <SelectValue placeholder="Nivel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {levelFilter.options.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {total === 0 ? (
        <p className="text-sm text-muted-foreground">Sin resultados</p>
      ) : (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              Anterior
            </Button>
            {pageNumbers.map((p) => (
              <Button
                key={p}
                variant={p === page ? "default" : "outline"}
                size="sm"
                onClick={() => onPageChange(p)}
              >
                {p}
              </Button>
            ))}
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              Siguiente
            </Button>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>
              {total} resultado{total !== 1 ? "s" : ""}
            </span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => onPageSizeChange(Number(v))}
            >
              <SelectTrigger className="w-[80px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}
