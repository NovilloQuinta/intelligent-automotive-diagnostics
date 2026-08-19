import { evaluatePid, bigEndian } from '@/domain/services/pidFormula.js'
import type { PidFormulaEntry } from '@/domain/pidFormulaEntry.js'
import type { PidFormulaCatalogPort } from '@/application/ports/PidFormulaCatalogPort.js'

/** Construye la clave de búsqueda normalizada para el catálogo. */
function pidKey(mode: string, pid: string): string {
  return `${mode.toUpperCase()} ${pid.toUpperCase()}`
}

/**
 * Crea un catálogo de fórmulas PID a partir de entradas externas.
 * @param entries - Iterable de tuplas `[key, PidFormulaEntry]`
 * @returns Catálogo con métodos `get` y `apply`
 *
 * @example
 * ```ts
 * const catalog = createPidFormulaCatalog([
 *   ['01 0C', { formula: '(A*256+B)/4', dataBytes: 2 }],
 * ])
 * catalog.apply('01', '0C', [0x0C, 0x80]) // → 800
 * ```
 */
export function createPidFormulaCatalog(
  entries: Iterable<readonly [string, PidFormulaEntry]>,
): PidFormulaCatalogPort {
  const map = new Map<string, PidFormulaEntry>(entries)

  return {
    get(mode: string, pid: string): PidFormulaEntry | undefined {
      return map.get(pidKey(mode, pid))
    },

    apply(mode: string, pid: string, bytes: number[]): number {
      const entry = map.get(pidKey(mode, pid))
      if (!entry) return bigEndian(bytes)
      return evaluatePid(entry.formula, bytes.slice(0, entry.dataBytes))
    },
  }
}
