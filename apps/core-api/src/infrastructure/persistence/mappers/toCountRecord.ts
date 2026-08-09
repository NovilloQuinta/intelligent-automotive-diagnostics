/** Convierte pares `{ key, value }` de un `GROUP BY` en un `Record` indexado por clave. */
export function toCountRecord(
  rows: readonly { key: string | number; value: number }[],
): Record<string, number> {
  const record: Record<string, number> = {}
  for (const row of rows) {
    record[String(row.key)] = row.value
  }
  return record
}
