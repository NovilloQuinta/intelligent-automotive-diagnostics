/** Date shortcut identifiers for predefined range calculations. */
export type DateShortcut = 'today' | '7d' | '30d'

/** Human-readable labels for date shortcuts (Spanish). */
export const DATE_SHORTCUT_LABELS: Record<DateShortcut, string> = {
  today: 'Hoy',
  '7d': '7 d',
  '30d': '30 d',
}

/**
 * Calculates a date range ({from, to}) for a given shortcut.
 *
 * - `today`: from = today at 00:00:00.000Z, to = now
 * - `7d`: from = 7 days ago at 00:00:00.000Z, to = now
 * - `30d`: from = 30 days ago at 00:00:00.000Z, to = now
 *
 * @param shortcut - One of 'today', '7d', '30d'
 * @returns An object with `from` and `to` ISO 8601 strings.
 */
export function computeDateRange(shortcut: DateShortcut): {
  from: string
  to: string
} {
  const now = new Date()
  const to = now.toISOString()
  const from = new Date(now)

  switch (shortcut) {
    case 'today':
      from.setHours(0, 0, 0, 0)
      break
    case '7d':
      from.setDate(from.getDate() - 7)
      from.setHours(0, 0, 0, 0)
      break
    case '30d':
      from.setDate(from.getDate() - 30)
      from.setHours(0, 0, 0, 0)
      break
  }

  return { from: from.toISOString(), to }
}
