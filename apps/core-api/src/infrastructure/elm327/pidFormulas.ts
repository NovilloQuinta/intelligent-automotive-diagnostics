import { evaluatePid } from '@/domain/services/pidFormula.js'
import { bigEndian } from './hexUtils.js'

/** Entrada de fórmula para un PID/DID con su expresión aritmética y bytes esperados. */
export interface PidFormulaEntry {
  readonly formula: string
  readonly dataBytes: number
}

/** Catálogo de fórmulas PID con consulta `get(mode, pid)` y aplicación `apply`. */
export interface PidFormulaCatalog {
  /**
   * Devuelve la entrada de fórmula para un PID, o `undefined` si no existe.
   * @param mode - Modo OBD (ej. `'01'`, `'22'`)
   * @param pid - Código PID/DID (ej. `'0C'`, `'1130'`)
   */
  get(mode: string, pid: string): PidFormulaEntry | undefined

  /**
   * Aplica la fórmula del PID a los bytes dados, o fallback big-endian si es desconocido.
   * @param mode - Modo OBD (ej. `'01'`, `'22'`)
   * @param pid - Código PID/DID (ej. `'0C'`, `'1130'`)
   * @param bytes - Array de bytes de respuesta (valores 0-255)
   * @returns Valor físico calculado
   * @throws {PidParseError} Si la fórmula es inválida o los bytes son insuficientes.
   */
  apply(mode: string, pid: string, bytes: number[]): number
}

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
): PidFormulaCatalog {
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
