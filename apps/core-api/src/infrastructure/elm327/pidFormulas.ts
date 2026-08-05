import { Formula } from '@/domain/value-objects/formula.js'
import { bigEndian } from './hexUtils.js'

/** Entrada de fórmula para un PID/DID con su expresión aritmética y bytes esperados. */
export interface PidFormulaEntry {
  readonly formula: string
  readonly dataBytes: number
}

/**
 * Catálogo de fórmulas PID con consulta `get(mode, pid)` y aplicación `apply`.
 *
 * El catálogo es **puro**: no contiene datos hardcodeados. Recibe sus entradas
 * externamente y las almacena en un `Map<key, PidFormulaEntry>` para búsqueda O(1).
 */
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
   * @throws {import('@/domain/services/pidFormula.js').PidParseError} Si la fórmula es inválida o los bytes son insuficientes.
   */
  apply(mode: string, pid: string, bytes: number[]): number
}

/**
 * Definición mínima de PID necesaria para convertir a entrada de fórmula.
 * Acepta cualquier objeto con estructura `{ pidCode: { key }, formula, dataBytes }`,
 * incluyendo instancias de `PidCode` y `PidDefinition`.
 *
 * `formula` acepta tanto `string` como objetos con `toString()` (ej. {@link Formula} VO).
 */
export interface PidDefinitionLike {
  readonly pidCode: { readonly key: string }
  readonly formula: string | { toString(): string }
  readonly dataBytes: number
}

/**
 * Convierte un array de definiciones PID a entradas de catálogo de fórmulas.
 *
 * Cada definición con fórmula no vacía se convierte en una tupla `[key, PidFormulaEntry]`.
 * Se filtran automáticamente las definiciones con fórmula vacía (ej. PIDs tipo ASCII
 * como VIN que no tienen fórmula aritmética).
 *
 * La conversión `Formula → string` ocurre aquí vía `toString()` cuando la definición
 * proviene de una entidad `PidDefinition` del dominio.
 *
 * @param definitions - Iterable de objetos con `{ pidCode: { key }, formula, dataBytes }`
 * @returns Array inmutable de tuplas `[key, PidFormulaEntry]` listas para el catálogo
 */
export function pidDefinitionsToFormulaEntries(
  definitions: Iterable<PidDefinitionLike>,
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

/**
 * Crea un catálogo de fórmulas PID a partir de entradas externas.
 *
 * El catálogo es puramente un `Map` indexado por clave compuesta `"MODE PID"`.
 * `get` y `apply` normalizan la búsqueda a mayúsculas. Si un PID no está en el
 * catálogo, `apply` usa fallback big-endian (`(A*256+B)` para 2 bytes, `A` para 1).
 *
 * @param entries - Iterable de tuplas `[key, PidFormulaEntry]` (ej. salida de `pidDefinitionsToFormulaEntries`)
 * @returns Catálogo inmutable con métodos `get` y `apply`
 *
 * @example
 * ```ts
 * const entries = pidDefinitionsToFormulaEntries(STANDARD_MODE_01_PIDS)
 * const catalog = createPidFormulaCatalog(entries)
 * catalog.apply('01', '0C', [0x0C, 0x80]) // → 800
 * ```
 */
export function createPidFormulaCatalog(
  entries: Iterable<readonly [string, PidFormulaEntry]>,
): PidFormulaCatalog {
  const map = new Map<string, PidFormulaEntry>(entries)

  return {
    get(mode: string, pid: string): PidFormulaEntry | undefined {
      return map.get(`${mode} ${pid.toUpperCase()}`)
    },

    apply(mode: string, pid: string, bytes: number[]): number {
      const entry = map.get(`${mode} ${pid.toUpperCase()}`)
      if (!entry) return bigEndian(bytes)
      return new Formula(entry.formula).evaluate(bytes.slice(0, entry.dataBytes))
    },
  }
}
