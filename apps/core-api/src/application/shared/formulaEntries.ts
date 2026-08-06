import type { PidFormulaEntry } from '@/domain/pidFormulaEntry.js'
import type { PidFormulaSource } from '@/application/dto/diagnosis/PidFormulaSource.js'

/**
 * Convierte definiciones PID a entradas de catálogo de fórmulas.
 * Filtra automáticamente las definiciones con fórmula vacía.
 * @param definitions - Iterable de objetos con `{ pidCode: { key }, formula, dataBytes }`
 * @returns Array inmutable de tuplas `[key, PidFormulaEntry]`
 */
export function toFormulaEntries(
  definitions: Iterable<PidFormulaSource>,
): Array<readonly [string, PidFormulaEntry]> {
  const entries: Array<readonly [string, PidFormulaEntry]> = []
  for (const def of definitions) {
    const formulaStr = typeof def.formula === 'string' ? def.formula : def.formula.toString()
    if (formulaStr === '') continue
    entries.push([def.pidCode.key, { formula: formulaStr, dataBytes: def.dataBytes }] as const)
  }
  return entries
}
