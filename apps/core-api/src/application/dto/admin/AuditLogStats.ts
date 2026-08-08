/** Rango de fechas para agregados de auditoria/usuarios. Ambos extremos son opcionales. */
export interface DateRange {
  readonly from?: string
  readonly to?: string
}

/**
 * Resumen agregado de auditoria HTTP para un rango de fechas: peticiones por status y por
 * ruta, sin exponer las filas individuales.
 */
export interface AuditLogStats {
  readonly byStatusCode: Readonly<Record<string, number>>
  readonly byPath: Readonly<Record<string, number>>
}
