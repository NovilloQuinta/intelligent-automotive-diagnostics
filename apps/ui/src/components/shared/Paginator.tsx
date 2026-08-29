import { useMemo } from 'react'
import { Button } from '@/components/ui/button'

/**
 * Items in the page window: either a page number or an ellipsis marker.
 *
 * - `number` = a clickable page button
 * - `ellipsis-start` / `ellipsis-end` = "…" visual gap
 */
export type PageItem = number | 'ellipsis-start' | 'ellipsis-end'

/** Number of siblings to show on each side of the current page. */
const PAGE_WINDOW_SIBLINGS = 1

/**
 * Builds a sliding window of page numbers: first, last, and `siblings` pages
 * on each side of the current page. Gaps are filled with ellipsis markers.
 *
 * Avoids rendering one button per page when `totalPages` is large.
 *
 * @param page - Current active page (1-based).
 * @param totalPages - Total number of pages.
 * @param siblings - Pages to show on each side of `page` (default 1).
 * @returns Ordered array of `PageItem`.
 */
export function computePageWindow(
  page: number,
  totalPages: number,
  siblings = PAGE_WINDOW_SIBLINGS,
): PageItem[] {
  const first = 1
  const last = totalPages
  const start = Math.max(first + 1, page - siblings)
  const end = Math.min(last - 1, page + siblings)

  const items: PageItem[] = [first]
  if (start > first + 1) items.push('ellipsis-start')
  for (let p = start; p <= end; p++) items.push(p)
  if (end < last - 1) items.push('ellipsis-end')
  if (last > first) items.push(last)
  return items
}

interface PaginatorProps {
  /** Current active page (1-based). */
  readonly page: number
  /** Total number of pages. */
  readonly totalPages: number
  /** Total number of items across all pages. */
  readonly total: number
  /** Called with the new page number when user navigates. */
  readonly onPageChange: (page: number) => void
}

/**
 * Shared pagination controls: Anterior/Siguiente buttons, sliding page window
 * with ellipsis markers, and total result count.
 */
export function Paginator({ page, totalPages, total, onPageChange }: PaginatorProps) {
  const pageWindow = useMemo(() => computePageWindow(page, totalPages), [page, totalPages])

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Anterior"
        >
          Anterior
        </Button>
        {pageWindow.map((item) =>
          typeof item === 'number' ? (
            <Button
              key={item}
              variant={item === page ? 'default' : 'outline'}
              size="sm"
              onClick={() => onPageChange(item)}
            >
              {item}
            </Button>
          ) : (
            <span key={item} className="px-1 text-sm text-muted-foreground" aria-hidden="true">
              …
            </span>
          ),
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Siguiente"
        >
          Siguiente
        </Button>
      </div>
      <span className="text-sm text-muted-foreground">
        {total} resultado{total !== 1 ? 's' : ''}
      </span>
    </div>
  )
}
