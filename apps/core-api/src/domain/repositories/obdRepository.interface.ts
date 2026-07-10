import type { LiveData, DtcCode } from '../entities/vehicle.ts'

/**
 * Contrato de adquisición de datos OBD-II.
 * El simulador (y en el futuro un adaptador OBD real) implementan esta interfaz.
 * Los casos de uso dependen de esta abstracción, no de una fuente concreta.
 */
export interface ObdRepository {
  /**
   * Lee los valores actuales de los sensores del vehículo.
   *
   * @returns Estado actual de todos los sensores OBD-II monitorizados.
   * @throws {Error} Si no hay conexión con la ECU o el simulador.
   */
  readLiveData(): Promise<LiveData>

  /**
   * Lee los códigos de error activos almacenados en la ECU.
   *
   * @returns Lista de DTCs activos. Vacío si no hay errores.
   * @throws {Error} Si no hay conexión con la ECU o el simulador.
   */
  readDtcCodes(): Promise<DtcCode[]>

  /**
   * Enciende o apaga el simulador.
   *
   * @param on - true para encender, false para apagar.
   * @throws {Error} Si el simulador no responde.
   */
  setPower(on: boolean): Promise<void>
}
