/**
 * Desenlace de validar una entrada del catalogo contra el vehiculo conectado.
 *
 * Cada caso de uso acota este conjunto al suyo: un DTC no puede quedar `out_of_range` (no hay
 * rango que comprobar) ni `unsupported` (`readDtcCodes` funciona tambien en simulacion).
 */
export type ValidationOutcome =
  | 'validated'
  | 'out_of_range'
  | 'no_vehicle'
  | 'unsupported'
  | 'invalid_formula'

/** Entrada tras el intento de validacion, junto al desenlace que lo explica. */
export interface ValidationResult<TEntry, TOutcome extends string = ValidationOutcome> {
  /** La entrada actualizada si se confirmo; la original, intacta, en cualquier otro caso. */
  readonly entry: TEntry
  readonly outcome: TOutcome
}
