import type { ObdRepository } from '@/application/ports/ObdRepository.js'
import type { PidKnowledgeEntry } from '@/application/dto/knowledge/PidKnowledgeEntry.js'
import type { PidFormulaSource } from '@/application/dto/diagnosis/PidFormulaSource.js'
import { PidRawReadNotSupportedError } from '@/application/obd/obdErrors.js'
import { markValidated } from '@/application/knowledge/confidenceScale.js'
import { Formula } from '@/domain/value-objects/formula.js'
import { PidParseError } from '@/domain/services/pidFormula.js'
import type { ValidationResult } from '@/application/dto/knowledge/ValidationResult.js'

/** Rango fisico plausible de un PID. Cada extremo ausente deja ese lado abierto. */
export interface PidRange {
  readonly minValue?: number
  readonly maxValue?: number
}

/** Comprueba un valor contra un rango con ambos extremos opcionales. */
export function isWithinRange(value: number, range: PidRange): boolean {
  return (
    (range.minValue === undefined || value >= range.minValue) &&
    (range.maxValue === undefined || value <= range.maxValue)
  )
}

/** Parte la clave compuesta de un PID (`"22 F40C"`) en modo y codigo.
 *
 * @throws {Error} Si la clave no tiene la forma `"<modo> <pid>"`
 */
function splitPidKey(key: string): readonly [mode: string, pid: string] {
  const [mode, pid] = key.split(' ')
  if (!mode || !pid) {
    throw new Error(`Invalid PID key: "${key}". Expected "<mode> <pid>" (e.g. "22 F40C").`)
  }
  return [mode, pid]
}

/**
 * Confirma contra el vehiculo conectado un PID recien descubierto.
 *
 * Lee los bytes crudos, les aplica **la formula del PID descubierto** (no la del catalogo
 * interno del adaptador) y comprueba que el valor resultante es fisicamente plausible.
 *
 * No escribe en ningun indice: devuelve la entrada actualizada y es el llamador —que si tiene
 * el `PidVectorRepository` inyectado— quien decide si la indexa. Asi el caso de uso se prueba
 * sin mockear LanceDB.
 */
export class ValidateDiscoveredPidUseCase {
  /**
   * @param entry — Entrada de conocimiento del PID descubierto
   * @param formula — Modo, codigo, formula y nº de bytes del PID
   * @param range — Rango fisico esperado del valor
   * @param obdRepo — Vehiculo conectado, o `undefined` si no hay ninguno
   */
  async execute(
    entry: PidKnowledgeEntry,
    formula: PidFormulaSource,
    range: PidRange,
    obdRepo: ObdRepository | undefined,
  ): Promise<ValidationResult<PidKnowledgeEntry>> {
    if (!obdRepo) return { entry, outcome: 'no_vehicle' }

    const [mode, pid] = splitPidKey(formula.pidCode.key)

    const bytes = await this.readRawBytes(mode, pid, formula.dataBytes, obdRepo)
    if (bytes === 'unsupported') return { entry, outcome: 'unsupported' }

    const value = this.evaluateFormula(formula.formula.toString(), bytes)
    if (value === 'invalid_formula') return { entry, outcome: 'invalid_formula' }

    if (!isWithinRange(value, range)) return { entry, outcome: 'out_of_range' }
    return { entry: markValidated(entry), outcome: 'validated' }
  }

  /**
   * Lee los bytes crudos del PID, degradando a `'unsupported'` cuando el adaptador no soporta
   * la lectura cruda. Un fallo real de conexion o timeout se propaga.
   */
  private async readRawBytes(
    mode: string,
    pid: string,
    dataBytes: number,
    obdRepo: ObdRepository,
  ): Promise<number[] | 'unsupported'> {
    try {
      return await obdRepo.readPidRaw(mode, pid, dataBytes)
    } catch (err) {
      if (err instanceof PidRawReadNotSupportedError) return 'unsupported'
      throw err
    }
  }

  /**
   * Evalua la formula descubierta contra los bytes leidos, degradando a `'invalid_formula'`
   * cuando no parsea o no se puede evaluar (input no confiable del LLM/web).
   */
  private evaluateFormula(formulaText: string, bytes: number[]): number | 'invalid_formula' {
    try {
      return new Formula(formulaText).evaluate(bytes)
    } catch (err) {
      if (err instanceof PidParseError) return 'invalid_formula'
      throw err
    }
  }
}
