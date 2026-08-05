import type { PidFormulaEntry } from './pidFormulas.js'

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

/**
 * Convierte definiciones PID a entradas de catálogo de fórmulas.
 * Filtra automáticamente las definiciones con fórmula vacía.
 * @param definitions - Iterable de objetos con `{ pidCode: { key }, formula, dataBytes }`
 * @returns Array inmutable de tuplas `[key, PidFormulaEntry]`
 */
export function pidDefinitionsToFormulaEntries(
  definitions: Iterable<PidFormulaSource>,
): Array<readonly [string, PidFormulaEntry]> {
  const entries: Array<readonly [string, PidFormulaEntry]> = []
  for (const def of definitions) {
    const formulaStr = typeof def.formula === 'string' ? def.formula : def.formula.toString()
    if (formulaStr === '') continue
    entries.push([
      def.pidCode.key,
      { formula: formulaStr, dataBytes: def.dataBytes },
    ] as const)
  }
  return entries
}
