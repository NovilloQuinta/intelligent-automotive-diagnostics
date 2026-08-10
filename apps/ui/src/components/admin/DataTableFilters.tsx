import { useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { computeDateRange, DATE_SHORTCUT_LABELS } from '@/lib/date'
import type { DateShortcut } from '@/lib/date'
import { Paginator } from '@/components/shared/Paginator'

type LevelFilter = {
  value?: string
  onChange: (level?: string) => void
  options: { value: string; label: string }[]
}

export interface PaginationConfig {
  readonly page: number
  readonly pageSize: number
  readonly total: number
  readonly onPageChange: (page: number) => void
  readonly onPageSizeChange: (pageSize: number) => void
}

type DataTableFiltersProps = {
  searchPlaceholder?: string
  onSearchChange: (q: string) => void
  onDateRangeChange: (range: { from?: string; to?: string }) => void
  dateRange?: { from?: string; to?: string }
  dateShortcuts?: DateShortcut[]
  levelFilter?: LevelFilter
  pagination: PaginationConfig
}

export function DataTableFilters(props: DataTableFiltersProps) {
  const {
    searchPlaceholder = 'Buscar...',
    onSearchChange,
    onDateRangeChange,
    dateShortcuts,
    levelFilter,
    pagination,
  } = props

  const { page, pageSize, total, onPageChange, onPageSizeChange } = pagination
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const handleShortcut = useCallback(
    (shortcut: DateShortcut) => {
      onDateRangeChange(computeDateRange(shortcut))
    },
    [onDateRangeChange],
  )

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
            value={levelFilter.value ?? 'all'}
            onValueChange={(v) => levelFilter.onChange(v === 'all' ? undefined : v)}
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
          <Paginator
            page={page}
            totalPages={totalPages}
            total={total}
            onPageChange={onPageChange}
          />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
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
  )
}
