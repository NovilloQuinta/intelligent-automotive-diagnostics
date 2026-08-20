import type { ObdRepository } from '@/application/ports/ObdRepository.js'
import type { VehicleRepository } from '@/application/ports/VehicleRepository.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import type { EcuInfo } from '@/domain/entities/EcuInfo.js'
import { UNKNOWN_VEHICLE_FIELD } from '@/application/use-cases/ResolveVehicleIdentityUseCase.js'
import type { IdentifyVehicleUseCase } from '@/application/use-cases/IdentifyVehicleUseCase.js'
import { loadEcuDefinitionLookup } from '@/application/ecu-catalog/loadEcuDefinitionLookup.js'
import { resolveEcuDefinitions } from '@/application/ecu-catalog/resolveEcuDefinitions.js'
import { persistDiscoveredEcus } from '@/application/shared/persistDiscoveredEcus.js'

/** Dependencias de {@link GetEcuInfoUseCase}, inyectadas por constructor. */
export interface GetEcuInfoUseCaseOptions {
  /** Catalogo del vehiculo. Ausente cuando la app corre sin persistencia. */
  readonly vehicleRepo: VehicleRepository | undefined
  readonly logger: LoggerPort
  /** Completa el fabricante/modelo cuando el vehiculo no se identifica solo por el VIN. */
  readonly identifyVehicle: IdentifyVehicleUseCase
}

/**
 * Barre el bus, guarda lo descubierto y resuelve los nombres que aprendio el agente.
 *
 * Recibe el `ObdRepository` ya resuelto en {@link execute} en vez de elegirlo: **decidir
 * que adaptador corresponde a cada escenario es infraestructura**, y este caso de uso no
 * debe conocer ni los escenarios ni el modo de conexion.
 *
 * La identificacion del vehiculo llega inyectada como {@link IdentifyVehicleUseCase}, que
 * es tambien de aplicacion: descubrir ECUs necesita saber que coche es, pero no tiene por
 * que saber como se averigua.
 */
export class GetEcuInfoUseCase {
  constructor(private readonly options: GetEcuInfoUseCaseOptions) {}

  /**
   * @param repository - Repositorio OBD del vehiculo activo, ya resuelto.
   * @returns Las ECUs descubiertas, con los nombres aprendidos ya resueltos.
   */
  async execute(repository: ObdRepository): Promise<EcuInfo[]> {
    const ecus = await repository.getEcuInfo()
    void this.persistDiscovered(repository, ecus)
    return this.resolveLearnedNames(repository, ecus)
  }

  /**
   * Sustituye el nombre de las ECUs sin catalogar por el que aprendio el agente.
   *
   * Lo resuelto se marca con `source: 'ai'` para que la pantalla lo distinga de lo que
   * dicta la norma: solo `7E8` esta estandarizada por ISO 15765-4.
   *
   * Best-effort: si el vehiculo no esta identificado o el catalogo falla, se devuelven
   * las ECUs tal cual. Descubrir no depende de poder resolver.
   */
  private async resolveLearnedNames(
    repository: ObdRepository,
    ecus: EcuInfo[],
  ): Promise<EcuInfo[]> {
    const { vehicleRepo, logger, identifyVehicle } = this.options
    if (!vehicleRepo || ecus.length === 0) return ecus
    try {
      const { make, model } = await identifyVehicle.execute(await repository.getVehicleInfo())
      // Solo se exige la marca. Con un coche real el modelo **nunca se conoce**: el
      // adaptador lo deja en `unknown` y la cascada resuelve el fabricante desde el WMI,
      // que identifica a la marca y no al modelo. Exigirlo abandonaba la resolucion antes
      // de consultar el catalogo, asi que nada de lo aprendido llegaba a un coche de verdad.
      // El modelo sigue afinando la busqueda cuando se sabe.
      if (make === UNKNOWN_VEHICLE_FIELD) return ecus
      const lookup = await loadEcuDefinitionLookup(vehicleRepo, make, model, ecus)
      return resolveEcuDefinitions(ecus, lookup)
    } catch (e) {
      logger.warn('Failed to resolve learned ECU names', {
        err: e instanceof Error ? e : String(e),
      })
      return ecus
    }
  }

  /**
   * Guarda las ECUs descubiertas contra el vehiculo activo, sin bloquear la respuesta.
   *
   * Best-effort a proposito: descubrir no depende de poder guardar. Si el vehiculo no
   * esta identificado todavia, o la escritura falla, el barrido se devuelve igual y solo
   * queda el aviso en el log.
   */
  private async persistDiscovered(repository: ObdRepository, ecus: EcuInfo[]): Promise<void> {
    const { vehicleRepo, logger, identifyVehicle } = this.options
    if (!vehicleRepo || ecus.length === 0) return
    try {
      const identified = await identifyVehicle.execute(await repository.getVehicleInfo())
      const { id } = await vehicleRepo.upsertVehicle(identifyVehicle.toVehicleProfile(identified))
      await persistDiscoveredEcus(vehicleRepo, id, ecus)
    } catch (e) {
      logger.warn('Failed to persist discovered ECUs', {
        err: e instanceof Error ? e : String(e),
      })
    }
  }
}
