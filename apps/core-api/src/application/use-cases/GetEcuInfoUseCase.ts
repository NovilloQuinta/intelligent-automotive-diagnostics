import type { ObdRepository } from '@/application/ports/ObdRepository.js'
import type { VehicleRepository } from '@/application/ports/VehicleRepository.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import type { EcuInfo } from '@/domain/entities/EcuInfo.js'
import type { VehicleProfile } from '@/domain/entities/VehicleProfile.js'
import type { VehicleInfo } from '@/domain/value-objects/VehicleInfo.js'
import { UNKNOWN_VEHICLE_FIELD } from '@/application/use-cases/ResolveVehicleIdentityUseCase.js'
import { loadEcuDefinitionLookup } from '@/application/ecu-catalog/loadEcuDefinitionLookup.js'
import { resolveEcuDefinitions } from '@/application/ecu-catalog/resolveEcuDefinitions.js'
import { persistDiscoveredEcus } from '@/application/shared/persistDiscoveredEcus.js'

/** Dependencias de {@link GetEcuInfoUseCase}, inyectadas por constructor. */
export interface GetEcuInfoUseCaseOptions {
  /** Catalogo del vehiculo. Ausente cuando la app corre sin persistencia. */
  readonly vehicleRepo: VehicleRepository | undefined
  readonly logger: LoggerPort
  /** Completa el fabricante/modelo cuando el vehiculo no se identifica solo por el VIN. */
  readonly identify: (vehicleInfo: VehicleInfo) => Promise<VehicleInfo>
  /** Proyecta el vehiculo identificado al agregado que persiste el catalogo. */
  readonly toVehicleProfile: (vehicleInfo: VehicleInfo) => VehicleProfile
}

/**
 * Barre el bus, guarda lo descubierto y resuelve los nombres que aprendio el agente.
 *
 * Recibe el `ObdRepository` ya resuelto en {@link execute} en vez de elegirlo: **decidir
 * que adaptador corresponde a cada escenario es infraestructura**, y este caso de uso no
 * debe conocer ni los escenarios ni el modo de conexion.
 *
 * `identify` y `toVehicleProfile` llegan como funciones porque las comparte con el resto
 * del flujo de diagnostico; es el mismo patron con el que `CognitiveDiagnosisRunner`
 * recibe su `host`.
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
    const { vehicleRepo, logger, identify } = this.options
    if (!vehicleRepo || ecus.length === 0) return ecus
    try {
      const { make, model } = await identify(await repository.getVehicleInfo())
      if (make === UNKNOWN_VEHICLE_FIELD || model === UNKNOWN_VEHICLE_FIELD) return ecus
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
    const { vehicleRepo, logger, identify, toVehicleProfile } = this.options
    if (!vehicleRepo || ecus.length === 0) return
    try {
      const identified = await identify(await repository.getVehicleInfo())
      const { id } = await vehicleRepo.upsertVehicle(toVehicleProfile(identified))
      await persistDiscoveredEcus(vehicleRepo, id, ecus)
    } catch (e) {
      logger.warn('Failed to persist discovered ECUs', {
        err: e instanceof Error ? e : String(e),
      })
    }
  }
}
