/**
 * Definición mínima de PID necesaria para convertir a entrada de fórmula.
 * Acepta cualquier objeto con `{ pidCode: { key }, formula, dataBytes }`,
 * incluyendo instancias de `PidCode` y `PidDefinition`.
 *
 * `formula` acepta tanto `string` como objetos con `toString()` (ej. {@link Formula} VO).
 */
export interface PidFormulaSource {
  readonly pidCode: { readonly key: string }
  readonly formula: string | { toString(): string }
  readonly dataBytes: number
}
