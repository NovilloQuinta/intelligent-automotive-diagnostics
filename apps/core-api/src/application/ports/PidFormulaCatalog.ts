import type { PidFormulaEntry } from '@/domain/pidFormulaEntry.js'

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
