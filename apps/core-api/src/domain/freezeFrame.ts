/** Snapshot de valores de sensores en el momento en que se disparó un DTC (Service 02). */
export interface FreezeFrame {
  /** Código DTC que provocó el snapshot. */
  readonly dtcCode: string
  /** Valores de PIDs congelados en el momento del fallo. */
  readonly pidValues: Record<string, number>
}
