import type { ObdRepository } from '@/application/ports/ObdRepository.js'
import type { DtcKnowledgeEntry } from '@/application/dto/knowledge/DtcKnowledgeEntry.js'
import { markValidated } from '@/application/knowledge/confidenceScale.js'
import type { ValidationResult } from '@/application/dto/knowledge/ValidationResult.js'

/**
 * Desenlaces posibles al validar un DTC. No hay `out_of_range` (un codigo esta o no esta, no
 * hay magnitud que acotar) ni `unsupported` (`readDtcCodes` funciona tambien en simulacion:
 * son los DTCs del escenario activo).
 */
export type DtcValidationOutcome = 'validated' | 'not_found' | 'no_vehicle'

/**
 * Confirma contra el vehiculo conectado un DTC recien descubierto.
 *
 * La validacion es por presencia: el codigo aparece —o no— en una lectura real de DTCs. Como
 * {@link ValidateDiscoveredPidUseCase}, no escribe en ningun indice; devuelve la entrada
 * actualizada y el llamador decide si la indexa.
 */
export class ValidateDiscoveredDtcUseCase {
  /**
   * @param entry — Entrada de conocimiento del DTC descubierto
   * @param code — Codigo DTC a buscar en el vehiculo (ej. `"P1234"`)
   * @param obdRepo — Vehiculo conectado, o `undefined` si no hay ninguno
   */
  async execute(
    entry: DtcKnowledgeEntry,
    code: string,
    obdRepo: ObdRepository | undefined,
  ): Promise<ValidationResult<DtcKnowledgeEntry, DtcValidationOutcome>> {
    if (!obdRepo) return { entry, outcome: 'no_vehicle' }

    const active = await obdRepo.readDtcCodes()
    if (!active.some((dtc) => dtc.code === code)) return { entry, outcome: 'not_found' }

    return { entry: markValidated(entry), outcome: 'validated' }
  }
}
