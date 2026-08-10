/**
 * Formats an ISO 8601 date string to a localized date-time in Spanish (Spain).
 *
 * @param iso - An ISO 8601 date-time string.
 * @returns A locale-formatted date-time string.
 */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-ES')
}
